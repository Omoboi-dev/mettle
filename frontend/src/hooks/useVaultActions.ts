import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { publicClient } from "../lib/chain";
import { erc20Abi, vaultAbi } from "../lib/abis";
import { TOKENS } from "../data/deployment";
import { useWallet } from "../context/WalletContext";
import { emitBalancesChanged, onBalancesChanged } from "../lib/balances";

const MUSD = TOKENS.mUSD as `0x${string}`;
const DECIMALS = 6;

interface VaultActions {
  /** User's mUSD balance (whole units). */
  balance: number;
  /** USD value of the user's position in this vault. */
  positionUsd: number;
  busy: string | null;
  error: string | null;
  lastTx: `0x${string}` | null;
  refresh: () => void;
  faucet: (amount: number) => Promise<void>;
  deposit: (amount: number) => Promise<void>;
  withdraw: (amount: number) => Promise<void>;
}

export function useVaultActions(vault: `0x${string}`): VaultActions {
  const { address, walletClient } = useWallet();
  const [balance, setBalance] = useState(0);
  const [positionUsd, setPositionUsd] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(0);
      setPositionUsd(0);
      return;
    }
    try {
      const [bal, shares, totalShares, totalAssets] = await Promise.all([
        publicClient.readContract({ address: MUSD, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "shares", args: [address] }),
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "totalShares" }),
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "totalAssets" }),
      ]);
      setBalance(Number(formatUnits(bal as bigint, DECIMALS)));
      const ts = totalShares as bigint;
      const value = ts > 0n ? ((shares as bigint) * (totalAssets as bigint)) / ts : 0n;
      setPositionUsd(Number(formatUnits(value, DECIMALS)));
    } catch {
      /* read failed — leave previous values */
    }
  }, [address, vault]);

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

  const faucet = useCallback(
    (amount: number) =>
      run("Minting test mUSD…", () =>
        walletClient!.writeContract({
          account: address!,
          chain: walletClient!.chain,
          address: MUSD,
          abi: erc20Abi,
          functionName: "mint",
          args: [address!, parseUnits(String(amount), DECIMALS)],
        }),
      ),
    [run, walletClient, address],
  );

  const deposit = useCallback(
    (amount: number) =>
      run("Depositing…", async () => {
        const amt = parseUnits(String(amount), DECIMALS);
        const allowance = (await publicClient.readContract({
          address: MUSD,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address!, vault],
        })) as bigint;
        if (allowance < amt) {
          const approveHash = await walletClient!.writeContract({
            account: address!,
            chain: walletClient!.chain,
            address: MUSD,
            abi: erc20Abi,
            functionName: "approve",
            args: [vault, amt],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        return walletClient!.writeContract({
          account: address!,
          chain: walletClient!.chain,
          address: vault,
          abi: vaultAbi,
          functionName: "deposit",
          args: [amt],
        });
      }),
    [run, walletClient, address, vault],
  );

  const withdraw = useCallback(
    (amount: number) =>
      run("Withdrawing…", async () => {
        const [shares, totalShares, totalAssets] = (await Promise.all([
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "shares", args: [address!] }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "totalShares" }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "totalAssets" }),
        ])) as [bigint, bigint, bigint];

        const amt = parseUnits(String(amount), DECIMALS);
        const positionValue = totalShares > 0n ? (shares * totalAssets) / totalShares : 0n;

        // Burn all shares when withdrawing the full position; otherwise convert the USD amount to
        // shares. Cap at the user's balance so rounding can never over-request.
        let sharesToBurn = amt >= positionValue || totalAssets === 0n ? shares : (amt * totalShares) / totalAssets;
        if (sharesToBurn > shares) sharesToBurn = shares;

        return walletClient!.writeContract({
          account: address!,
          chain: walletClient!.chain,
          address: vault,
          abi: vaultAbi,
          functionName: "withdraw",
          args: [sharesToBurn],
        });
      }),
    [run, walletClient, address, vault],
  );

  return { balance, positionUsd, busy, error, lastTx, refresh, faucet, deposit, withdraw };
}
