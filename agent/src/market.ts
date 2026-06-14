import { ASSETS, ROUNDS_OF_HISTORY } from "./config.js";

/// Real recent market data for one asset: the price history we show Claude, and the realized move
/// of the next candle (which Claude does NOT see) used to score the decision.
export type AssetMarket = {
  symbol: string;
  token: `0x${string}`;
  contextCloses: number[];
  realizedMoveBps: number;
};

const BYBIT = "https://api.bybit.com/v5/market/kline";

/// Fetch `count` hourly closes for a Bybit spot symbol, oldest first.
async function fetchCloses(symbol: string, count: number): Promise<number[]> {
  const url = `${BYBIT}?category=spot&symbol=${symbol}&interval=60&limit=${count}`;
  const res = await fetch(url);
  const json = (await res.json()) as { retCode: number; result?: { list?: string[][] } };
  const list = json.result?.list;
  if (json.retCode !== 0 || !list || list.length === 0) {
    throw new Error(`Bybit returned no data for ${symbol}`);
  }
  // Bybit returns newest first; reverse to oldest first and take the close (index 4).
  return list
    .map((k) => Number(k[4]))
    .reverse();
}

/// Split a close series into "what the agent sees" and "the realized move it's scored on".
function splitSeries(closes: number[]): { contextCloses: number[]; realizedMoveBps: number } {
  const contextCloses = closes.slice(0, -1);
  const prev = closes[closes.length - 2];
  const last = closes[closes.length - 1];
  const realizedMoveBps = Math.round((last / prev - 1) * 10_000);
  return { contextCloses, realizedMoveBps };
}

/// MI4 is an index, so we approximate it as an equal-weight blend of BTC, ETH and SOL.
async function indexCloses(count: number): Promise<number[]> {
  const [btc, eth, sol] = await Promise.all([
    fetchCloses("BTCUSDT", count),
    fetchCloses("ETHUSDT", count),
    fetchCloses("SOLUSDT", count),
  ]);
  const n = Math.min(btc.length, eth.length, sol.length);
  const blend: number[] = [];
  for (let i = 0; i < n; i++) {
    // Normalize each to its first value so they contribute equally, then average.
    blend.push((btc[i] / btc[0] + eth[i] / eth[0] + sol[i] / sol[0]) / 3);
  }
  return blend;
}

/// USDY is a yield stablecoin: a near-flat line with a tiny upward drift.
function yieldCloses(count: number): number[] {
  return Array.from({ length: count }, (_, i) => 1 + i * 0.00005);
}

/// Load real, recent market context for every tradable asset. Falls back to a flat series for any
/// asset whose feed is unavailable, so a single failing symbol never breaks the round.
export async function loadMarket(): Promise<AssetMarket[]> {
  const count = ROUNDS_OF_HISTORY + 1;
  const out: AssetMarket[] = [];

  for (const asset of ASSETS) {
    try {
      let closes: number[];
      if (asset.symbol === "MI4") closes = await indexCloses(count);
      else if (asset.symbol === "USDY") closes = yieldCloses(count);
      else closes = await fetchCloses(asset.bybit!, count);

      const { contextCloses, realizedMoveBps } = splitSeries(closes);
      out.push({ symbol: asset.symbol, token: asset.token, contextCloses, realizedMoveBps });
    } catch (err) {
      console.warn(`  ! ${asset.symbol}: ${(err as Error).message} — using a flat fallback`);
      out.push({ symbol: asset.symbol, token: asset.token, contextCloses: [1, 1], realizedMoveBps: 0 });
    }
  }

  return out;
}
