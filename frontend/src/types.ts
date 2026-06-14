export type AssetSymbol = "mETH" | "fBTC" | "MNT" | "USDY" | "MI4";

/** Static description of an agent — the parts that don't come from the chain. */
export interface AgentMeta {
  id: string;
  name: string;
  /** Short strategy label. */
  strategy: string;
  /** One honest sentence on how it trades. Long-or-cash only — no shorting or leverage. */
  blurb: string;
  asset: AssetSymbol;
  /** Accent color used across cards and charts. */
  accent: string;
  vault: `0x${string}`;
}

/** A single on-chain decision, as read from AIRunner. */
export interface DecisionView {
  vault: `0x${string}`;
  agentId: number;
  agentName: string;
  asset: AssetSymbol | "CASH";
  /** Size as a fraction of the book, 0–10000 basis points. */
  sizeBps: number;
  /** Realized market move it was scored against, in basis points. */
  moveBps: number;
  score: number;
  rationaleURI: string;
  rationaleHash: `0x${string}`;
  epoch: number;
  timestamp: number;
  txHash?: `0x${string}`;
}

/** An agent enriched with everything we read live from the chain. */
export interface AgentLive {
  meta: AgentMeta;
  /** Average validation score (the reputation), 0–100. */
  reputation: number;
  /** Number of settled, scored epochs (the track record length). */
  epochs: number;
  /** USD currently managed by the vault (6-decimal mUSD, returned as a float). */
  capitalUsd: number;
  /** Allocation weight from the controller (0 if ineligible). */
  allocWeight: number;
  /** Share of total allocation weight, as a percentage. */
  allocPct: number;
  /** The agent's most recent decision, if any. */
  last?: DecisionView;
  /** Whether these numbers are live from chain or the seeded fallback. */
  live: boolean;
}

export interface SystemStats {
  /** Total USD managed across all vaults. */
  totalValueManaged: number;
  /** Total settled epochs across all agents. */
  epochs: number;
  /** Number of active agents. */
  agents: number;
  /** Total decisions logged on-chain. */
  decisions: number;
}
