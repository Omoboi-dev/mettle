import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepolia, deployed, STRATEGIES, RPC_URLS } from "./config.js";
import { aiRunnerAbi } from "./abis.js";
import { loadMarket } from "./market.js";
import { decide } from "./brain.js";
import { validate, clampMove } from "./risk.js";

const AIRUNNER = deployed.core.AIRunner as `0x${string}`;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — copy agent/.env.example to agent/.env and fill it in`);
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/// Retry a few times before giving up, handing each attempt a fresh index so it can switch RPC
/// endpoints — a transient failure on one public node shouldn't sink the whole round.
async function withRetry<T>(label: string, fn: (attempt: number) => Promise<T>): Promise<T> {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      if (i === attempts - 1) throw err;
      console.warn(`  ! ${label} failed (attempt ${i + 1}/${attempts}), retrying on another node...`);
      await sleep(2500);
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const account = privateKeyToAccount(requireEnv("OPERATOR_PRIVATE_KEY") as `0x${string}`);
  requireEnv("LLM_BASE_URL");
  requireEnv("LLM_API_KEY");

  // A fresh client bound to a specific endpoint. Building one per attempt (rather than reusing a
  // single long-lived connection) is what lets a retry actually land on a different node.
  const clientsFor = (url: string) => ({
    publicClient: createPublicClient({ chain: mantleSepolia, transport: http(url) }),
    walletClient: createWalletClient({ account, chain: mantleSepolia, transport: http(url) }),
  });

  // The operator must own AIRunner, or runEpochAI will revert.
  const { publicClient } = clientsFor(RPC_URLS[0]);
  const owner = await publicClient.readContract({
    address: AIRUNNER,
    abi: aiRunnerAbi,
    functionName: "owner",
  });
  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `Operator ${account.address} is not the AIRunner owner (${owner}). ` +
        `Transfer ownership to the operator first (see the README).`,
    );
  }

  console.log(`\nMettle round — operator ${account.address}\n`);
  console.log("Reading the market...");
  const market = await loadMarket();
  const symbols = market.map((m) => m.symbol);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("rationales", { recursive: true });
  const log: unknown[] = [];

  for (const agent of deployed.agents) {
    const persona = STRATEGIES[agent.strategy];
    const decision = await decide(agent.name, persona, market);
    const v = validate(decision, symbols);

    // Resolve the on-chain asset and the real move it will be scored against.
    const chosen = v.symbol ? market.find((m) => m.symbol === v.symbol)! : market[0];
    const assetToken = chosen.token;
    const moveBps = v.symbol ? clampMove(chosen.realizedMoveBps) : 0;

    const rationaleURI = (decision.rationale ?? "").slice(0, 280);
    const rationaleHash = keccak256(toBytes(decision.rationale ?? ""));

    // Simulate first (gives us the resulting score and guards against a revert), then send. Each
    // attempt rotates to the next RPC endpoint so a flaky node can't fail the agent outright.
    const { score, hash } = await withRetry(`${agent.name} on-chain`, async (attempt) => {
      const { publicClient: pc, walletClient: wc } = clientsFor(RPC_URLS[attempt % RPC_URLS.length]);
      const { result: score, request } = await pc.simulateContract({
        account,
        address: AIRUNNER,
        abi: aiRunnerAbi,
        functionName: "runEpochAI",
        args: [agent.vault as `0x${string}`, assetToken, v.sizeBps, BigInt(moveBps), rationaleURI, rationaleHash],
      });
      const hash = await wc.writeContract(request);
      await pc.waitForTransactionReceipt({ hash });
      return { score, hash };
    });

    const pick = v.symbol ? `${v.symbol} @ ${(v.sizeBps / 100).toFixed(0)}%` : "CASH";
    const move = v.symbol ? `${(moveBps / 100).toFixed(2)}%` : "-";
    console.log(`\n${agent.name} (${agent.strategy})`);
    console.log(`  decision : ${pick}   real move ${move}   -> score ${score}`);
    console.log(`  rationale: ${decision.rationale}`);
    if (v.flags.length) console.log(`  risk     : ${v.flags.join("; ")}`);
    console.log(`  tx       : ${deployed.explorer}/tx/${hash}`);

    log.push({ agent: agent.name, decision, validated: v, moveBps, score, hash });
    await sleep(1500); // let the RPC catch up to the block we just mined before the next agent
  }

  writeFileSync(`rationales/round-${stamp}.json`, JSON.stringify(log, null, 2));
  console.log(`\nRound complete. Full record saved to rationales/round-${stamp}.json\n`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
