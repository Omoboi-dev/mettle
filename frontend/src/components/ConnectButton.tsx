import { useEffect, useRef, useState } from "react";
import { Wallet, AlertTriangle, LogOut, Droplets, Copy, Check, ExternalLink, ChevronDown, Loader2 } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useMusd } from "../hooks/useMusd";
import { shortHash, usd, addressUrl } from "../lib/format";

export function ConnectButton() {
  const { address, isCorrectChain, connecting, connect, disconnect, switchChain } = useWallet();
  const { balance, minting, mint } = useMusd();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!address) {
    return (
      <button
        onClick={connect}
        disabled={connecting}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-mint to-teal px-3.5 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.03] disabled:opacity-60"
      >
        <Wallet size={15} />
        {connecting ? "Connecting…" : "Connect"}
      </button>
    );
  }

  if (!isCorrectChain) {
    return (
      <button
        onClick={switchChain}
        className="inline-flex items-center gap-2 rounded-lg border border-coral/40 bg-coral/10 px-3.5 py-2 text-sm font-medium text-coral"
      >
        <AlertTriangle size={15} />
        Switch to Mantle
      </button>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-white/5 px-3.5 py-2 text-sm text-white transition-colors hover:border-mint/40"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-mint" />
        <span className="font-mono">{shortHash(address, 6, 4)}</span>
        <ChevronDown size={14} className={`text-slate transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface-2 shadow-xl shadow-black/40">
          {/* Balance */}
          <div className="border-b border-line px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-slate">Test balance</div>
            <div className="mt-0.5 text-lg font-semibold">{usd(balance)} mUSD</div>
          </div>

          {/* Mint faucet — anyone can top up */}
          <button
            onClick={() => mint(1000)}
            disabled={minting}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-white transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            {minting ? <Loader2 size={15} className="animate-spin text-mint" /> : <Droplets size={15} className="text-mint" />}
            {minting ? "Minting…" : "Mint 1,000 test mUSD"}
          </button>

          {/* Copy address */}
          <button
            onClick={copy}
            className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-left text-sm text-slate transition-colors hover:bg-white/5 hover:text-white"
          >
            {copied ? <Check size={15} className="text-mint" /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy address"}
          </button>

          {/* Explorer */}
          <a
            href={addressUrl(address)}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-left text-sm text-slate transition-colors hover:bg-white/5 hover:text-white"
          >
            <ExternalLink size={15} /> View on explorer
          </a>

          {/* Disconnect */}
          <button
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-left text-sm text-coral transition-colors hover:bg-coral/10"
          >
            <LogOut size={15} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
