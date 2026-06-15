import { publicClient } from "./chain";
import { aiRunnerAbi, allocationAbi, decisionExecutedEvent, validationAbi, vaultAbi } from "./abis";
import { CORE, assetForAddress } from "../data/deployment";
import { AGENTS, AGENT_BY_VAULT, SEED_REPUTATION } from "../data/agents";
import type { AgentLive, AgentMeta, AssetSymbol, DecisionView, SystemStats } from "../types";

// AIRunner.lastDecision returns a tuple:
// [epoch, asset, sizeBps, moveBps, score, rationaleHash, rationaleURI, timestamp]
type RawDecision = readonly [bigint, `0x${string}`, number, bigint, number, `0x${string}`, string, bigint];

function decodeDecision(meta: AgentMeta, agentId: number, d: RawDecision): DecisionView | undefined {
  const [epoch, asset, sizeBps, moveBps, score, rationaleHash, rationaleURI, timestamp] = d;
  if (epoch === 0n) return undefined;
  const isCash = sizeBps === 0;
  const sym = (assetForAddress(asset) as AssetSymbol | undefined) ?? meta.asset;
  return {
    vault: meta.vault,
    agentId,
    agentName: meta.name,
    asset: isCash ? "CASH" : sym,
    sizeBps,
    moveBps: Number(moveBps),
    score,
    rationaleURI,
    rationaleHash,
    epoch: Number(epoch),
    timestamp: Number(timestamp),
  };
}

/** When the chain is unreachable, render the seed deployment so the page is never blank. */
function fallbackAgent(meta: AgentMeta): AgentLive {
  return {
    meta,
    reputation: SEED_REPUTATION[meta.id] ?? 50,
    epochs: 1,
    capitalUsd: 0,
    allocWeight: SEED_REPUTATION[meta.id] ?? 0,
    allocPct: 0,
    live: false,
  };
}

async function loadAgent(meta: AgentMeta): Promise<AgentLive> {
  try {
    const agentIdBn = (await publicClient.readContract({
      address: meta.vault,
      abi: vaultAbi,
      functionName: "agentId",
    })) as bigint;
    const agentId = Number(agentIdBn);

    const [capitalBn, summary, weightBn, last] = await Promise.all([
      publicClient.readContract({ address: meta.vault, abi: vaultAbi, functionName: "totalAssets" }) as Promise<bigint>,
      publicClient.readContract({
        address: CORE.ValidationRegistry as `0x${string}`,
        abi: validationAbi,
        functionName: "getSummary",
        args: [agentIdBn, [meta.vault], ""],
      }) as Promise<readonly [bigint, number]>,
      (
        publicClient.readContract({
          address: CORE.AllocationController as `0x${string}`,
          abi: allocationAbi,
          functionName: "eligibleWeight",
          args: [meta.vault],
        }) as Promise<bigint>
      ).catch(() => 0n),
      (
        publicClient.readContract({
          address: CORE.AIRunner as `0x${string}`,
          abi: aiRunnerAbi,
          functionName: "lastDecision",
          args: [meta.vault],
        }) as Promise<RawDecision>
      ).catch(() => undefined),
    ]);

    const [count, avg] = summary;
    return {
      meta,
      reputation: Number(avg),
      epochs: Number(count),
      capitalUsd: Number(capitalBn) / 1e6,
      allocWeight: Number(weightBn),
      allocPct: 0,
      last: last ? decodeDecision(meta, agentId, last) : undefined,
      live: true,
    };
  } catch {
    return fallbackAgent(meta);
  }
}

export async function loadAgents(
  previous: AgentLive[] = [],
): Promise<{ agents: AgentLive[]; stats: SystemStats }> {
  const loaded = await Promise.all(AGENTS.map(loadAgent));

  // If an agent's read failed this cycle (e.g. a cold/throttled RPC after the tab was backgrounded),
  // keep its last-known-good values instead of flashing the static seed numbers. Only genuinely
  // fresh reads (live) replace what we already had.
  const prevById = new Map(previous.map((p) => [p.meta.id, p]));
  const agents = loaded.map((a) => (a.live ? a : (prevById.get(a.meta.id) ?? a)));

  // Allocation share: each eligible agent's weight over the total weight.
  const totalWeight = agents.reduce((s, a) => s + a.allocWeight, 0);
  for (const a of agents) a.allocPct = totalWeight > 0 ? (a.allocWeight / totalWeight) * 100 : 0;

  // Rank by reputation, strongest first.
  agents.sort((a, b) => b.reputation - a.reputation);

  const stats: SystemStats = {
    totalValueManaged: agents.reduce((s, a) => s + a.capitalUsd, 0),
    epochs: agents.reduce((s, a) => s + a.epochs, 0),
    agents: agents.length,
    decisions: agents.reduce((s, a) => s + a.epochs, 0),
  };

  return { agents, stats };
}

/** Build a decision feed from each agent's most recent on-chain decision, newest first. */
export function feedFromAgents(agents: AgentLive[]): DecisionView[] {
  return agents
    .map((a) => a.last)
    .filter((d): d is DecisionView => Boolean(d))
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Read the full decision history from AIRunner's DecisionExecuted logs, newest first. Each entry
 * carries the asset, size, realized move, score, the rationale and its on-chain hash, plus the
 * transaction hash so anyone can verify it on the explorer. Falls back to an empty list (the caller
 * uses per-agent last decisions instead) if the public RPC won't serve the log range.
 */
function getDecisionLogs(fromBlock: bigint, toBlock: bigint) {
  return publicClient.getLogs({
    address: CORE.AIRunner as `0x${string}`,
    event: decisionExecutedEvent,
    fromBlock,
    toBlock,
  });
}
type DecisionLog = Awaited<ReturnType<typeof getDecisionLogs>>[number];

export async function loadDecisionHistory(windows = 12, limit = 60): Promise<DecisionView[]> {
  try {
    const latest = await publicClient.getBlockNumber();
    // The public RPC caps eth_getLogs at ~10k blocks, so walk back in sub-cap windows and gather.
    const span = 9_000n;
    const all: DecisionLog[] = [];
    let to = latest;
    for (let i = 0; i < windows && to > 0n; i++) {
      const from = to > span ? to - span : 0n;
      all.push(...(await getDecisionLogs(from, to)));
      to = from - 1n;
    }

    all.sort((a, b) => {
      const ab = a.blockNumber ?? 0n;
      const bb = b.blockNumber ?? 0n;
      return ab < bb ? 1 : ab > bb ? -1 : (b.logIndex ?? 0) - (a.logIndex ?? 0);
    });
    const recent = all.slice(0, limit);

    // Resolve block timestamps once per block.
    const blockNums = [...new Set(recent.map((l) => l.blockNumber).filter((b): b is bigint => b != null))];
    const times = new Map<bigint, number>();
    await Promise.all(
      blockNums.map(async (bn) => {
        const block = await publicClient.getBlock({ blockNumber: bn });
        times.set(bn, Number(block.timestamp));
      }),
    );

    return recent
      .map((log): DecisionView | undefined => {
        const a = log.args;
        if (!a.vault || a.sizeBps == null) return undefined;
        const meta = AGENT_BY_VAULT[a.vault.toLowerCase()];
        const isCash = Number(a.sizeBps) === 0;
        const sym = (assetForAddress(a.asset ?? "") as AssetSymbol | undefined) ?? meta?.asset ?? "MNT";
        return {
          vault: a.vault,
          agentId: Number(a.agentId ?? 0),
          agentName: meta?.name ?? "Agent",
          asset: isCash ? "CASH" : sym,
          sizeBps: Number(a.sizeBps),
          moveBps: Number(a.moveBps ?? 0n),
          score: Number(a.score ?? 0),
          rationaleURI: a.rationaleURI ?? "",
          rationaleHash: a.rationaleHash ?? "0x",
          epoch: 0,
          timestamp: log.blockNumber != null ? (times.get(log.blockNumber) ?? 0) : 0,
          txHash: log.transactionHash ?? undefined,
        };
      })
      .filter((d): d is DecisionView => Boolean(d));
  } catch {
    return [];
  }
}
