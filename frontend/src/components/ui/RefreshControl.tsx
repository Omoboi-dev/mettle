import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useMettleData } from "../../context/MettleContext";
import { ago } from "../../lib/format";

export function RefreshControl() {
  const { refreshing, lastUpdated, refresh } = useMettleData();
  const [, setTick] = useState(0);

  // Re-render every 15s so "updated Ns ago" stays current.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 text-xs text-slate">
      <span>{lastUpdated ? `Updated ${ago(lastUpdated / 1000)}` : "Loading…"}</span>
      <button
        onClick={refresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/5 px-2.5 py-1.5 text-slate transition-colors hover:border-mint/40 hover:text-white disabled:opacity-60"
      >
        <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        Refresh
      </button>
    </div>
  );
}
