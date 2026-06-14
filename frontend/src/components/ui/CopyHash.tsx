import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { shortHash } from "../../lib/format";

export function CopyHash({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <button
      onClick={copy}
      title={`Copy ${label ?? "value"}: ${value}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white/5 px-2 py-1 font-mono text-[11px] text-slate transition-colors hover:border-mint/40 hover:text-white"
    >
      {copied ? <Check size={12} className="text-mint" /> : <Copy size={12} />}
      {copied ? "Copied" : shortHash(value)}
    </button>
  );
}
