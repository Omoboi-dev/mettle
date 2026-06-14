import { EXPLORER } from "../data/deployment";

/** Compact USD, e.g. 1_210_000 -> "$1.21M". */
export function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/** Basis points as a signed percent, e.g. -73 -> "-0.73%". */
export function bpsPct(bps: number, digits = 2): string {
  const v = bps / 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

/** Size in bps -> whole percent, e.g. 2500 -> "25%". */
export function sizePct(bps: number): string {
  return `${Math.round(bps / 100)}%`;
}

/** Shorten a hash, e.g. 0xabcd...1234. */
export function shortHash(h: string, lead = 6, tail = 4): string {
  if (h.length <= lead + tail) return h;
  return `${h.slice(0, lead)}…${h.slice(-tail)}`;
}

export function txUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

export function addressUrl(addr: string): string {
  return `${EXPLORER}/address/${addr}`;
}

/** Relative time, e.g. "2h ago". */
export function ago(tsSeconds: number): string {
  if (!tsSeconds) return "—";
  const diff = Date.now() / 1000 - tsSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
