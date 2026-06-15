import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepolia, deployed, STRATEGIES, HOME_ASSET, RPC_URLS } from "./config.js";
import { aiRunnerAbi, allocationControllerAbi } from "./abis.js";
import { loadMarket } from "./market.js";
import { decide } from "./brain.js";
import { validate, clampMove } from "./risk.js";

const AIRUNNER = deployed.core.AIRunner as `0x${string}`;
const CONTROLLER = deployed.core.AllocationController as `0x${string}`;

// Vault addresses sorted ascending — AllocationController.allocate requires a strictly ascending
// candidate list (it's how the contract guarantees uniqueness without unbounded gas).
const SORTED_VAULTS = deployed.agents
  .map((a) => a.vault as `0x${string}`)
  .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));

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

type Account = ReturnType<typeof privateKeyToAccount>;

// A fresh client bound to a specific endpoint. Building one per attempt (rather than reusing a
// single long-lived connection) is what lets a retry actually land on a different node.
const clientsFor = (account: Account, url: string) => ({
  publicClient: createPublicClient({ chain: mantleSepolia, transport: http(url) }),
  walletClient: createWalletClient({ account, chain: mantleSepolia, transport: http(url) }),
});

async function runRound(account: Account) {
  console.log(`\nMettle round — operator ${account.address}\n`);
  console.log("Reading the market...");
  const market = await loadMarket();
  const symbols = market.map((m) => m.symbol);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("rationales", { recursive: true });
  const log: unknown[] = [];

  for (const agent of deployed.agents) {
    const persona = STRATEGIES[agent.strategy];
    const decision = await decide(agent.name, persona, market, HOME_ASSET[agent.strategy]);
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
      const { publicClient: pc, walletClient: wc } = clientsFor(account, RPC_URLS[attempt % RPC_URLS.length]);
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

/// After a round settles, route the index's pooled capital to the best agents: recall everything
/// back to idle, then re-deploy weighted by each agent's fresh on-chain score. This is what makes a
/// plain "deposit into the index" flow to the top performers without anyone picking an agent.
///
/// Defensive by design: the round is the important part, so any problem here is logged and
/// swallowed rather than allowed to break the loop. Skips cleanly if the operator doesn't own the
/// controller (allocate is onlyOwner) or if there's nothing to deploy.
async function rebalanceIndex(account: Account) {
  try {
    const { publicClient: pc, walletClient: wc } = clientsFor(account, RPC_URLS[0]);

    const owner = (await pc.readContract({
      address: CONTROLLER,
      abi: allocationControllerAbi,
      functionName: "owner",
    })) as `0x${string}`;
    if (owner.toLowerCase() !== account.address.toLowerCase()) {
      console.log(
        `\nIndex: operator isn't the AllocationController owner, skipping allocation. ` +
          `Transfer ownership to ${account.address} to enable auto-allocation (see the README).`,
      );
      return;
    }

    // Is there anything to do? Capital is either idle (fresh deposits) or already deployed in vaults.
    // If the pool is completely empty, say so and stop — no point recalling or allocating nothing.
    const deployedCount = (await pc.readContract({
      address: CONTROLLER,
      abi: allocationControllerAbi,
      functionName: "deployedVaultCount",
    })) as bigint;
    const idleBefore = (await pc.readContract({
      address: CONTROLLER,
      abi: allocationControllerAbi,
      functionName: "idleUSD",
    })) as bigint;
    if (idleBefore === 0n && deployedCount === 0n) {
      console.log("\nIndex: no capital to allocate at the moment.");
      return;
    }

    console.log("\nIndex: allocating pooled capital by latest scores...");

    // Pull all deployed capital back to idle so we can re-weight by the scores from this round.
    if (deployedCount > 0n) {
      const { request } = await pc.simulateContract({
        account,
        address: CONTROLLER,
        abi: allocationControllerAbi,
        functionName: "recall",
        args: [SORTED_VAULTS],
      });
      const hash = await wc.writeContract(request);
      await pc.waitForTransactionReceipt({ hash });
      console.log(`  recalled deployed capital to idle (${hash})`);
    }

    const idle = (await pc.readContract({
      address: CONTROLLER,
      abi: allocationControllerAbi,
      functionName: "idleUSD",
    })) as bigint;
    if (idle === 0n) {
      console.log("  no capital to allocate at the moment.");
      return;
    }

    const { request } = await pc.simulateContract({
      account,
      address: CONTROLLER,
      abi: allocationControllerAbi,
      functionName: "allocate",
      args: [SORTED_VAULTS, idle],
    });
    const hash = await wc.writeContract(request);
    await pc.waitForTransactionReceipt({ hash });
    console.log(`  deployed ${(Number(idle) / 1e6).toFixed(2)} mUSD across eligible agents (${hash})`);
  } catch (err) {
    console.warn(`Index rebalance skipped: ${(err as Error).message ?? err}`);
  }
}

async function main() {
  const account = privateKeyToAccount(requireEnv("OPERATOR_PRIVATE_KEY") as `0x${string}`);
  requireEnv("LLM_BASE_URL");
  requireEnv("LLM_API_KEY");

  // The operator must own AIRunner, or runEpochAI will revert. Check once up front.
  const { publicClient } = clientsFor(account, RPC_URLS[0]);
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

  // Loop mode: set ROUND_INTERVAL_MINUTES to run rounds autonomously on a timer. Left unset, the
  // command runs a single round and exits (the original behaviour). A failed round in loop mode is
  // logged but doesn't kill the loop — the next tick tries again.
  const intervalMin = Number(process.env.ROUND_INTERVAL_MINUTES);
  if (!Number.isFinite(intervalMin) || intervalMin <= 0) {
    await runRound(account);
    await rebalanceIndex(account);
    return;
  }

  console.log(`Autonomous mode — a round every ${intervalMin} min. Ctrl+C to stop.`);
  for (;;) {
    try {
      await runRound(account);
      await rebalanceIndex(account);
    } catch (err) {
      console.error(`Round failed: ${(err as Error).message ?? err}. Retrying next tick.`);
    }
    const next = new Date(Date.now() + intervalMin * 60_000);
    console.log(`Next round at ${next.toLocaleTimeString()}.`);
    await sleep(intervalMin * 60_000);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
