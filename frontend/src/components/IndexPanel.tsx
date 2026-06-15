import { useState } from "react";
import { ExternalLink, Layers, Loader2 } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useIndexActions } from "../hooks/useIndexActions";
import { ConnectButton } from "./ConnectButton";
import { usd, txUrl } from "../lib/format";

export function IndexPanel() {
  const { address, isCorrectChain } = useWallet();
  const { balance, positionUsd, navUsd, idleUsd, busy, error, lastTx, deposit, withdraw } = useIndexActions();
  const [amount, setAmount] = useState("100");
  const [wAmount, setWAmount] = useState("");

  const amt = Number(amount);
  const wAmt = Number(wAmount);
  const canDeposit = !busy && amt > 0 && amt <= balance;
  const canWithdraw = !busy && wAmt > 0 && wAmt <= positionUsd + 1e-6;
  // Withdrawals are paid from idle capital; deployed capital must be recalled (between epochs) first.
  const exceedsIdle = wAmt > 0 && wAmt > idleUsd + 1e-6;

  return (
    <div className="glass p-7 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint/10 text-mint">
          <Layers size={22} />
        </span>
        <div>
          <h2 className="text-xl font-semibold leading-tight">Invest in the index</h2>
          <p className="text-sm text-slate">One deposit, spread across the best agents</p>
        </div>
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-slate">
        Deposit once and the allocation controller routes your capital to the top-performing agents automatically,
        weighted by their on-chain reputation. You never pick an agent yourself.
      </p>

      {/* Index stats — visible to everyone, wallet or not. */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-line bg-white/5 px-5 py-4">
          <div className="text-xs uppercase tracking-wider text-slate">Total managed</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{usd(navUsd)}</div>
        </div>
        <div className="rounded-xl border border-line bg-white/5 px-5 py-4">
          <div className="text-xs uppercase tracking-wider text-slate">Awaiting allocation</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{usd(idleUsd)}</div>
        </div>
      </div>

      {!address ? (
        <div className="mt-5 flex flex-col items-start gap-3">
          <p className="text-sm text-slate">Connect a wallet to invest.</p>
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
        <div className="mt-6 space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-line bg-white/5 px-5 py-4">
            <div>
              <div className="text-sm text-slate">Wallet balance</div>
              <div className="text-lg font-semibold">{usd(balance)} mUSD</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate">Your stake</div>
              <div className="text-lg font-semibold">{usd(positionUsd)}</div>
            </div>
          </div>

          {/* Deposit */}
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-slate">Deposit amount (mUSD)</label>
            <div className="flex gap-2.5">
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-white outline-none focus:border-mint/40"
              />
              <button
                onClick={() => deposit(amt)}
                disabled={!canDeposit}
                className="shrink-0 rounded-xl bg-gradient-to-r from-mint to-teal px-6 py-3 text-base font-semibold text-ink transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              >
                Deposit
              </button>
            </div>
            {amt > balance && (
              <p className="mt-2 text-xs text-coral">
                More than your balance — mint test mUSD from the wallet menu (top right) first.
              </p>
            )}
          </div>

          {/* Withdraw */}
          <div className="rounded-xl border border-line bg-white/5 px-5 py-4">
            <label className="mb-2 block text-xs uppercase tracking-wider text-slate">Withdraw amount (mUSD)</label>
            <div className="flex gap-2.5">
              <div className="relative flex-1">
                <input
                  type="number"
                  min={0}
                  placeholder="Amount to withdraw"
                  value={wAmount}
                  onChange={(e) => setWAmount(e.target.value)}
                  disabled={positionUsd <= 0}
                  className="w-full rounded-xl border border-line bg-surface px-4 py-3 pr-16 text-base text-white outline-none focus:border-mint/40 disabled:opacity-50"
                />
                <button
                  onClick={() => setWAmount(String(positionUsd))}
                  disabled={positionUsd <= 0}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-medium text-mint disabled:opacity-50"
                >
                  Max
                </button>
              </div>
              <button
                onClick={() => withdraw(wAmt)}
                disabled={!canWithdraw}
                className="shrink-0 rounded-xl border border-line bg-white/5 px-6 py-3 text-base font-medium text-white transition-colors hover:border-coral/40 disabled:opacity-50"
              >
                Withdraw
              </button>
            </div>
            {exceedsIdle && (
              <p className="mt-2 text-xs text-slate">
                Only {usd(idleUsd)} is idle right now — the rest is deployed in agents. Capital is recalled between
                trading rounds, so try again shortly for the full amount.
              </p>
            )}
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
