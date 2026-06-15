import { useState } from "react";
import { Droplets, ExternalLink, Loader2 } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useVaultActions } from "../hooks/useVaultActions";
import { ConnectButton } from "./ConnectButton";
import { usd, txUrl } from "../lib/format";

export function VaultPanel({ vault, agentName }: { vault: `0x${string}`; agentName: string }) {
  const { address, isCorrectChain } = useWallet();
  const { balance, positionUsd, busy, error, lastTx, faucet, deposit, withdraw } = useVaultActions(vault);
  const [amount, setAmount] = useState("100");
  const [wAmount, setWAmount] = useState("");

  const amt = Number(amount);
  const wAmt = Number(wAmount);
  const canDeposit = !busy && amt > 0 && amt <= balance;
  const canWithdraw = !busy && wAmt > 0 && wAmt <= positionUsd + 1e-6;

  return (
    <div className="glass p-5">
      <h2 className="text-lg font-semibold">Invest in {agentName}</h2>
      <p className="mt-1 text-sm text-slate">
        Deposit test mUSD into this agent's vault to follow its strategy. The agent can trade your deposit but can never
        withdraw it — you keep custody.
      </p>

      {!address ? (
        <div className="mt-5 flex flex-col items-start gap-3">
          <p className="text-sm text-slate">Connect a wallet to deposit.</p>
          <ConnectButton />
        </div>
      ) : !isCorrectChain ? (
        <div className="mt-5">
          <p className="text-sm text-coral">Switch your wallet to Mantle Sepolia to continue.</p>
          <div className="mt-3">
            <ConnectButton />
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {/* Balances */}
          <div className="flex items-center justify-between rounded-lg border border-line bg-white/5 px-4 py-3 text-sm">
            <div>
              <div className="text-slate">Wallet balance</div>
              <div className="font-semibold">{usd(balance)} mUSD</div>
            </div>
            <button
              onClick={() => faucet(1000)}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-mint/30 bg-mint/10 px-3 py-1.5 text-xs font-medium text-mint disabled:opacity-60"
            >
              <Droplets size={13} /> Get 1,000 test mUSD
            </button>
          </div>

          {/* Deposit */}
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-slate">Deposit amount (mUSD)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-mint/40"
              />
              <button
                onClick={() => deposit(amt)}
                disabled={!canDeposit}
                className="shrink-0 rounded-lg bg-gradient-to-r from-mint to-teal px-5 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              >
                Deposit
              </button>
            </div>
            {amt > balance && <p className="mt-1.5 text-xs text-coral">More than your balance — mint some test mUSD first.</p>}
          </div>

          {/* Position + withdraw */}
          <div className="rounded-lg border border-line bg-white/5 px-4 py-3">
            <div className="mb-2.5 flex items-center justify-between text-sm">
              <span className="text-slate">Your position</span>
              <span className="font-semibold">{usd(positionUsd)}</span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min={0}
                  placeholder="Amount to withdraw"
                  value={wAmount}
                  onChange={(e) => setWAmount(e.target.value)}
                  disabled={positionUsd <= 0}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 pr-14 text-sm text-white outline-none focus:border-mint/40 disabled:opacity-50"
                />
                <button
                  onClick={() => setWAmount(String(positionUsd))}
                  disabled={positionUsd <= 0}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-mint disabled:opacity-50"
                >
                  Max
                </button>
              </div>
              <button
                onClick={() => withdraw(wAmt)}
                disabled={!canWithdraw}
                className="shrink-0 rounded-lg border border-line bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-coral/40 disabled:opacity-50"
              >
                Withdraw
              </button>
            </div>
          </div>

          {/* Status */}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-slate">
              <Loader2 size={14} className="animate-spin" /> {busy}
            </p>
          )}
          {error && <p className="text-sm text-coral">{error}</p>}
          {lastTx && !busy && (
            <a
              href={txUrl(lastTx)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-mint hover:underline"
            >
              Last transaction confirmed <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
