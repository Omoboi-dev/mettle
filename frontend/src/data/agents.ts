import type { AgentMeta, AssetSymbol } from "../types";

// The five seeded agents. Vault addresses are the live Mantle Sepolia deployment. Strategy blurbs
// describe what the agents ACTUALLY do: each round they either go long one asset or sit in cash —
// no shorting, no leverage, no yield farming.
export const AGENTS: AgentMeta[] = [
  {
    id: "momentum-alpha",
    name: "Momentum Alpha",
    strategy: "Momentum",
    blurb: "Goes long the asset with the strongest recent trend, and sits in cash when no trend is clear.",
    asset: "mETH",
    accent: "#3df5c0",
    vault: "0x5fe4cdd6c12712968cb90a6e513417d55c0f8cdd",
  },
  {
    id: "breakout-hunter",
    name: "Breakout Hunter",
    strategy: "Breakout",
    blurb: "Buys an asset breaking out of its recent range, and waits in cash until one does.",
    asset: "fBTC",
    accent: "#38bdf8",
    vault: "0x0f3e55fd68a17ad653f51f810728b0c8a60cdf8f",
  },
  {
    id: "volatility-harvester",
    name: "Volatility Harvester",
    strategy: "Volatility",
    blurb: "Takes a position when volatility expands, and stays out when markets are quiet.",
    asset: "MNT",
    accent: "#c084fc",
    vault: "0x1d665641a18ed29efd6377af56f4510f3f53cd31",
  },
  {
    id: "steady-yield",
    name: "Steady Yield",
    strategy: "Capital preservation",
    blurb: "Prefers safety — small, cautious positions, leaning to cash when nothing is compelling.",
    asset: "USDY",
    accent: "#94a3b8",
    vault: "0xda2392671d08e7f15cad73697ff54cd03755a02b",
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion",
    strategy: "Mean reversion",
    blurb: "Buys assets that have pulled back from an overextended move, and holds cash when nothing looks stretched.",
    asset: "MI4",
    accent: "#f0617a",
    vault: "0x3ea332055fef9545191bff1a11f7eac20cb2141b",
  },
];

export const AGENT_BY_VAULT: Record<string, AgentMeta> = Object.fromEntries(
  AGENTS.map((a) => [a.vault.toLowerCase(), a]),
);

// Headline numbers the agents were seeded with on deploy — used only as a fallback if the live
// reads fail, so the dashboard still renders something truthful to the seed round.
export const SEED_REPUTATION: Record<string, number> = {
  "momentum-alpha": 100,
  "breakout-hunter": 80,
  "volatility-harvester": 70,
  "steady-yield": 60,
  "mean-reversion": 40,
};

export const ASSET_COLOR: Record<AssetSymbol, string> = {
  mETH: "#3df5c0",
  fBTC: "#f7931a",
  MNT: "#65b3ae",
  USDY: "#8b9a8f",
  MI4: "#c084fc",
};
