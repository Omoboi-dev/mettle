import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { publicClient } from "../lib/chain";
import { allocationAbi, erc20Abi } from "../lib/abis";
import { CORE, TOKENS } from "../data/deployment";
import { useWallet } from "../context/WalletContext";
import { emitBalancesChanged, onBalancesChanged } from "../lib/balances";

const MUSD = TOKENS.mUSD as `0x${string}`;
const INDEX = CORE.AllocationController as `0x${string}`;
const DECIMALS = 6;

interface IndexActions {
  /** User's mUSD wallet balance (whole units). */
  balance: number;
  /** USD value of the user's stake in the index (their share of total NAV). */
  positionUsd: number;
  /** Total value managed by the index across idle + deployed capital. */
  navUsd: number;
  /** USD currently idle (deposited but not yet routed to agents). */
  idleUsd: number;
  busy: string | null;
  error: string | null;
  lastTx: `0x${string}` | null;
  refresh: () => void;
  deposit: (amount: number) => Promise<void>;
  withdraw: (amount: number) => Promise<void>;
}

export function useIndexActions(): IndexActions {
  const { address, walletClient } = useWallet();
  const [balance, setBalance] = useState(0);
  const [positionUsd, setPositionUsd] = useState(0);
  const [navUsd, setNavUsd] = useState(0);
  const [idleUsd, setIdleUsd] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);

  const refresh = useCallback(async () => {
    // Settle reads independently: a flaky node on the heavy totalNAV() call must not block the
    // wallet-balance update (otherwise a deposit looks like it didn't change anything).
    const [sharesR, totalSharesR, navR, idleR, balR] = await Promise.allSettled([
      address
        ? publicClient.readContract({ address: INDEX, abi: allocationAbi, functionName: "shares", args: [address] })
        : Promise.resolve(0n),
      publicClient.readContract({ address: INDEX, abi: allocationAbi, functionName: "totalShares" }),
      publicClient.readContract({ address: INDEX, abi: allocationAbi, functionName: "totalNAV" }),
      publicClient.readContract({ address: INDEX, abi: allocationAbi, functionName: "idleUSD" }),
      address
        ? publicClient.readContract({ address: MUSD, abi: erc20Abi, functionName: "balanceOf", args: [address] })
        : Promise.resolve(0n),
    ]);

    const val = (r: PromiseSettledResult<unknown>): bigint | null =>
      r.status === "fulfilled" ? (r.value as bigint) : null;

    const nav = val(navR);
    const idle = val(idleR);
    const bal = val(balR);
    const shares = val(sharesR);
    const totalShares = val(totalSharesR);

    if (bal !== null) setBalance(Number(formatUnits(bal, DECIMALS)));
    if (nav !== null) setNavUsd(Number(formatUnits(nav, DECIMALS)));
    if (idle !== null) setIdleUsd(Number(formatUnits(idle, DECIMALS)));
    if (shares !== null && totalShares !== null && nav !== null) {
      const value = totalShares > 0n ? (shares * nav) / totalShares : 0n;
      setPositionUsd(Number(formatUnits(value, DECIMALS)));
    }
  }, [address]);

  useEffect(() => {
    refresh();
    return onBalancesChanged(refresh);
  }, [refresh]);

  // Run a write, wait for the receipt, refresh balances. Labels the in-flight step for the UI.
  const run = useCallback(
    async (label: string, fn: () => Promise<`0x${string}`>) => {
      if (!walletClient || !address) {
        setError("Connect your wallet first.");
        return;
      }
      setBusy(label);
      setError(null);
      try {
        const hash = await fn();
        await publicClient.waitForTransactionReceipt({ hash });
        setLastTx(hash);
        await refresh();
        emitBalancesChanged();
      } catch (err) {
        const msg = (err as { shortMessage?: string }).shortMessage ?? "Transaction failed.";
        setError(msg);
      } finally {
        setBusy(null);
      }
    },
    [walletClient, address, refresh],
  );

  const deposit = useCallback(
    (amount: number) =>
      run("Depositing into the index…", async () => {
        const amt = parseUnits(String(amount), DECIMALS);
        const allowance = (await publicClient.readContract({
          address: MUSD,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address!, INDEX],
        })) as bigint;
        if (allowance < amt) {
          const approveHash = await walletClient!.writeContract({
            account: address!,
            chain: walletClient!.chain,
            address: MUSD,
            abi: erc20Abi,
            functionName: "approve",
            args: [INDEX, amt],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        return walletClient!.writeContract({
          account: address!,
          chain: walletClient!.chain,
          address: INDEX,
          abi: allocationAbi,
          functionName: "deposit",
          args: [amt],
        });
      }),
    [run, walletClient, address],
  );

  const withdraw = useCallback(
    (amount: number) =>
      run("Withdrawing from the index…", async () => {
        const [shares, totalShares, nav] = (await Promise.all([
          publicClient.readContract({ address: INDEX, abi: allocationAbi, functionName: "shares", args: [address!] }),
          publicClient.readContract({ address: INDEX, abi: allocationAbi, functionName: "totalShares" }),
          publicClient.readContract({ address: INDEX, abi: allocationAbi, functionName: "totalNAV" }),
        ])) as [bigint, bigint, bigint];

        const amt = parseUnits(String(amount), DECIMALS);
        const positionValue = totalShares > 0n ? (shares * nav) / totalShares : 0n;

        // Burn all shares on a full withdrawal; otherwise convert the USD amount to index shares.
        // Cap at the user's balance so rounding can never over-request.
        let sharesToBurn = amt >= positionValue || nav === 0n ? shares : (amt * totalShares) / nav;
        if (sharesToBurn > shares) sharesToBurn = shares;

        return walletClient!.writeContract({
          account: address!,
          chain: walletClient!.chain,
          address: INDEX,
          abi: allocationAbi,
          functionName: "withdraw",
          args: [sharesToBurn],
        });
      }),
    [run, walletClient, address],
  );

  return { balance, positionUsd, navUsd, idleUsd, busy, error, lastTx, refresh, deposit, withdraw };
}
