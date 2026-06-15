// A tiny cross-component signal so any balance-changing action (mint, deposit, withdraw) tells every
// balance-reading hook to refresh — no shared provider needed. Components emit after a confirmed tx
// and subscribe to re-read their own balances.

const EVENT = "mettle:balances-changed";

export function emitBalancesChanged() {
  window.dispatchEvent(new Event(EVENT));
}

// Subscribe to balance changes. Re-reads immediately and again after a short delay, because the
// public RPCs are behind a fallback transport: the first read can land on a node that hasn't synced
// the new block yet, so a single read can come back stale.
export function onBalancesChanged(refresh: () => void): () => void {
  const handler = () => {
    refresh();
    setTimeout(refresh, 2500);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
