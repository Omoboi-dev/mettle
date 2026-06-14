import { defineChain } from "viem";
import deployed from "../../deployed.json" with { type: "json" };

export { deployed };

// More than one endpoint on purpose: public RPCs have the odd transient hiccup, so the runner can
// retry on a different one instead of failing the round outright.
export const RPC_URLS = ["https://rpc.sepolia.mantle.xyz", "https://mantle-sepolia.drpc.org"];

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: RPC_URLS } },
  blockExplorers: { default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" } },
});

/// The five assets an agent can choose from each round, and where their real price comes from.
/// mETH/fBTC/MNT track ETH/BTC/MNT prices; MI4 is a blend (it's an index); USDY is a yield
/// stablecoin, so it barely moves. Each asset names both feeds: Bybit (the primary) and a CoinGecko
/// id (the fallback for networks where Bybit is blocked).
export type AssetSource = {
  symbol: string;
  token: `0x${string}`;
  bybit: string | null;
  coingecko: string | null;
};

export const ASSETS: AssetSource[] = [
  { symbol: "mETH", token: deployed.tokens.mETH as `0x${string}`, bybit: "ETHUSDT", coingecko: "ethereum" },
  { symbol: "fBTC", token: deployed.tokens.fBTC as `0x${string}`, bybit: "BTCUSDT", coingecko: "bitcoin" },
  { symbol: "MNT", token: deployed.tokens.MNT as `0x${string}`, bybit: "MNTUSDT", coingecko: "mantle" },
  { symbol: "MI4", token: deployed.tokens.MI4 as `0x${string}`, bybit: null, coingecko: null }, // index blend
  { symbol: "USDY", token: deployed.tokens.USDY as `0x${string}`, bybit: null, coingecko: null }, // yield ~flat
];

/// How each strategy thinks. This is the persona the model takes on for that agent.
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
  minSizeBps: 2_500, // if an agent trades at all, commit at least 25% — anything smaller is dust
  maxSizeBps: 10_000, // never deploy more than 100% of the book
  minConviction: 0.45, // below this confidence, force cash (no trade)
  maxMoveBps: 5_000, // ignore absurd price moves (matches the on-chain clamp)
};

export const ROUNDS_OF_HISTORY = 24; // candles of context handed to the model

// The decision is scored on the real move over the next HOLDOUT_HOURS, held out of the context the
// model sees. A longer holdout is a bigger, more meaningful market move than a single next candle.
export const HOLDOUT_HOURS = 12;
