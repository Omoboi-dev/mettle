import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepolia, deployed, STRATEGIES } from "./config.js";
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

async function main() {
  const account = privateKeyToAccount(requireEnv("OPERATOR_PRIVATE_KEY") as `0x${string}`);
  requireEnv("LLM_BASE_URL");
  requireEnv("LLM_API_KEY");

  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http() });
  const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http() });

  // The operator must own AIRunner, or runEpochAI will revert.
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

    // Simulate first (gives us the resulting score and guards against a revert), then send.
    const { result: score, request } = await publicClient.simulateContract({
      account,
      address: AIRUNNER,
      abi: aiRunnerAbi,
      functionName: "runEpochAI",
      args: [agent.vault as `0x${string}`, assetToken, v.sizeBps, BigInt(moveBps), rationaleURI, rationaleHash],
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });

    const pick = v.symbol ? `${v.symbol} @ ${(v.sizeBps / 100).toFixed(0)}%` : "CASH";
    const move = v.symbol ? `${(moveBps / 100).toFixed(2)}%` : "-";
    console.log(`\n${agent.name} (${agent.strategy})`);
    console.log(`  decision : ${pick}   real move ${move}   -> score ${score}`);
    console.log(`  rationale: ${decision.rationale}`);
    if (v.flags.length) console.log(`  risk     : ${v.flags.join("; ")}`);
    console.log(`  tx       : ${deployed.explorer}/tx/${hash}`);

    log.push({ agent: agent.name, decision, validated: v, moveBps, score, hash });
  }

  writeFileSync(`rationales/round-${stamp}.json`, JSON.stringify(log, null, 2));
  console.log(`\nRound complete. Full record saved to rationales/round-${stamp}.json\n`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
