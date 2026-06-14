import { ASSET_COLOR } from "../../data/agents";
import type { AssetSymbol } from "../../types";

export function TokenChip({ asset }: { asset: AssetSymbol | "CASH" }) {
  if (asset === "CASH") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/5 px-2.5 py-1 text-xs font-medium text-slate">
        Cash
      </span>
    );
  }
  const color = ASSET_COLOR[asset];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: `${color}1f`, color, border: `1px solid ${color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {asset}
    </span>
  );
}
