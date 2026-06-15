import { Wallet, AlertTriangle, LogOut } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { shortHash } from "../lib/format";

export function ConnectButton() {
  const { address, isCorrectChain, connecting, connect, disconnect, switchChain } = useWallet();

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

  return (
    <button
      onClick={disconnect}
      title="Disconnect"
      className="group inline-flex items-center gap-2 rounded-lg border border-line bg-white/5 px-3.5 py-2 text-sm text-white transition-colors hover:border-coral/40"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-mint" />
      <span className="font-mono">{shortHash(address, 6, 4)}</span>
      <LogOut size={14} className="text-slate group-hover:text-coral" />
    </button>
  );
}
