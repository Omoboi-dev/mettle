import { ASSETS, ROUNDS_OF_HISTORY, HOLDOUT_HOURS } from "./config.js";
import type { AssetSource } from "./config.js";

/// Real recent market data for one asset: the price history we show the model, and the realized
/// move of the next candle (which the model does NOT see) used to score the decision.
export type AssetMarket = {
  symbol: string;
  token: `0x${string}`;
  contextCloses: number[];
  realizedMoveBps: number;
};

const BYBIT = "https://api.bybit.com/v5/market/kline";
const COINGECKO = "https://api.coingecko.com/api/v3/coins";

/// Fetch `count` hourly closes for a Bybit spot symbol, oldest first. This is the primary feed.
async function bybitCloses(symbol: string, count: number): Promise<number[]> {
  const url = `${BYBIT}?category=spot&symbol=${symbol}&interval=60&limit=${count}`;
  const res = await fetch(url);
  const json = (await res.json()) as { retCode: number; result?: { list?: string[][] } };
  const list = json.result?.list;
  if (json.retCode !== 0 || !list || list.length === 0) {
    throw new Error(`Bybit returned no data for ${symbol}`);
  }
  // Bybit returns newest first; reverse to oldest first and take the close (index 4).
  return list.map((k) => Number(k[4])).reverse();
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// CoinGecko's free tier rate-limits bursts, so two guards: reuse any id already fetched this run
// (BTC/ETH get asked for twice — once as an asset, once inside the MI4 blend), and space the calls
// out via a single serial gate. A round is one process, so the cache can't go stale across rounds.
const cgCache = new Map<string, Promise<number[]>>();
let cgGate: Promise<void> = Promise.resolve();

/// Fetch the last `count` hourly closes for a CoinGecko coin id, oldest first. This is the fallback
/// for networks where Bybit is blocked. A few days of history comes back hourly; we trim to the tail.
function coingeckoCloses(id: string, count: number): Promise<number[]> {
  const hit = cgCache.get(id);
  if (hit) return hit;
  const out = (async () => {
    const turn = cgGate.then(() => sleep(2000));
    cgGate = turn;
    await turn;
    const url = `${COINGECKO}/${id}/market_chart?vs_currency=usd&days=4`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`CoinGecko returned ${res.status} for ${id}`);
        const json = (await res.json()) as { prices?: [number, number][] };
        const prices = json.prices;
        if (!prices || prices.length === 0) throw new Error(`CoinGecko returned no data for ${id}`);
        return prices.map((p) => p[1]).slice(-count);
      } catch (err) {
        lastErr = err;
        await sleep(2500); // brief backoff, then one retry before giving up to the flat fallback
      }
    }
    throw lastErr;
  })();
  cgCache.set(id, out);
  return out;
}

/// Try each feed in order and return the first that answers. Bybit leads (the track's exchange);
/// CoinGecko backs it up so a blocked or flaky exchange doesn't leave the agent blind.
async function firstFeed(label: string, feeds: { name: string; load: () => Promise<number[]> }[]) {
  let lastErr: unknown;
  for (const feed of feeds) {
    try {
      return await feed.load();
    } catch (err) {
      lastErr = err;
      console.warn(`  ~ ${label}: ${feed.name} feed unavailable, trying the next one`);
    }
  }
  throw lastErr ?? new Error(`no feed answered for ${label}`);
}

/// Closes for a single asset, Bybit first then CoinGecko.
function assetCloses(asset: AssetSource, count: number): Promise<number[]> {
  return firstFeed(asset.symbol, [
    { name: "Bybit", load: () => bybitCloses(asset.bybit!, count) },
    { name: "CoinGecko", load: () => coingeckoCloses(asset.coingecko!, count) },
  ]);
}

/// Split a close series into "what the agent sees" and "the realized move it's scored on". The
/// model gets everything up to the cutoff; the move over the held-out window after it is the score.
function splitSeries(closes: number[]): { contextCloses: number[]; realizedMoveBps: number } {
  const cutoff = closes.length - HOLDOUT_HOURS;
  const contextCloses = closes.slice(0, cutoff);
  const atDecision = closes[cutoff - 1];
  const last = closes[closes.length - 1];
  const realizedMoveBps = Math.round((last / atDecision - 1) * 10_000);
  return { contextCloses, realizedMoveBps };
}

/// Equal-weight blend of three series, each normalized to its own first value so they count equally.
function blend(series: number[][]): number[] {
  const n = Math.min(...series.map((s) => s.length));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(series.reduce((sum, s) => sum + s[i] / s[0], 0) / series.length);
  }
  return out;
}

/// MI4 is an index, so we approximate it as an equal-weight blend of BTC, ETH and SOL — from Bybit
/// if we can reach it, otherwise CoinGecko.
function indexCloses(count: number): Promise<number[]> {
  const all = (load: (id: string, c: number) => Promise<number[]>, ids: [string, string, string]) =>
    Promise.all(ids.map((id) => load(id, count))).then(blend);
  return firstFeed("MI4", [
    { name: "Bybit", load: () => all(bybitCloses, ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) },
    { name: "CoinGecko", load: () => all(coingeckoCloses, ["bitcoin", "ethereum", "solana"]) },
  ]);
}

/// USDY is a yield stablecoin: a near-flat line with a tiny upward drift.
function yieldCloses(count: number): number[] {
  return Array.from({ length: count }, (_, i) => 1 + i * 0.00005);
}

/// Load real, recent market context for every tradable asset. Falls back to a flat series for any
/// asset whose feed is unavailable, so a single failing symbol never breaks the round.
export async function loadMarket(): Promise<AssetMarket[]> {
  const count = ROUNDS_OF_HISTORY + HOLDOUT_HOURS;
  const out: AssetMarket[] = [];

  for (const asset of ASSETS) {
    try {
      let closes: number[];
      if (asset.symbol === "MI4") closes = await indexCloses(count);
      else if (asset.symbol === "USDY") closes = yieldCloses(count);
      else closes = await assetCloses(asset, count);

      const { contextCloses, realizedMoveBps } = splitSeries(closes);
      out.push({ symbol: asset.symbol, token: asset.token, contextCloses, realizedMoveBps });
    } catch (err) {
      console.warn(`  ! ${asset.symbol}: ${(err as Error).message} — using a flat fallback`);
      out.push({ symbol: asset.symbol, token: asset.token, contextCloses: [1, 1], realizedMoveBps: 0 });
    }
  }

  return out;
}
