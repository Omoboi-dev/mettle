import { defineChain } from "viem";
import deployed from "../../deployed.json" with { type: "json" };

export { deployed };

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
  blockExplorers: { default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" } },
});

/// The five assets an agent can choose from each round, and where their real price comes from.
/// mETH/fBTC/MNT track ETH/BTC/MNT on Bybit; MI4 is a blend (it's an index); USDY is a yield
/// stablecoin, so it barely moves.
export type AssetSource = { symbol: string; token: `0x${string}`; bybit: string | null };

export const ASSETS: AssetSource[] = [
  { symbol: "mETH", token: deployed.tokens.mETH as `0x${string}`, bybit: "ETHUSDT" },
  { symbol: "fBTC", token: deployed.tokens.fBTC as `0x${string}`, bybit: "BTCUSDT" },
  { symbol: "MNT", token: deployed.tokens.MNT as `0x${string}`, bybit: "MNTUSDT" },
  { symbol: "MI4", token: deployed.tokens.MI4 as `0x${string}`, bybit: null }, // index blend
  { symbol: "USDY", token: deployed.tokens.USDY as `0x${string}`, bybit: null }, // yield ~flat
];

/// How each strategy thinks. This is the persona Claude takes on for that agent.
export const STRATEGIES: Record<string, string> = {
  momentum:
    "You chase momentum. Favor the asset whose recent trend is strongest and still accelerating. Size up when the trend is clean and one-directional; stay in cash when it's choppy or topping.",
  breakout:
    "You hunt breakouts. Favor an asset pushing out of its recent range on expanding movement. Avoid mid-range chop, and don't chase a move that already ran.",
  volatility:
    "You harvest volatility. Prefer the asset with the most tradable movement, but keep position size moderate so a sharp reversal can't wreck the book.",
  steady:
    "You seek steady, low-risk return. Prefer calm, low-volatility exposure and small sizes; you are happy to sit in cash rather than force a trade.",
  "mean-reversion":
    "You fade extremes. Favor an asset that has overshot and looks stretched, betting it reverts. If nothing looks stretched, stay in cash.",
};

/// Risk limits the off-chain validator enforces before any decision is executed on-chain.
export const RISK = {
  maxSizeBps: 10_000, // never deploy more than 100% of the book
  minConviction: 0.45, // below this confidence, force cash (no trade)
  maxMoveBps: 5_000, // ignore absurd price moves (matches the on-chain clamp)
};

export const ROUNDS_OF_HISTORY = 24; // candles of context handed to Claude
