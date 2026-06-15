import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { publicClient } from "../lib/chain";
import { erc20Abi } from "../lib/abis";
import { TOKENS } from "../data/deployment";
import { useWallet } from "../context/WalletContext";
import { emitBalancesChanged, onBalancesChanged } from "../lib/balances";

const MUSD = TOKENS.mUSD as `0x${string}`;
const DECIMALS = 6;

/** Read the connected wallet's mUSD balance and mint more from the public test faucet. */
export function useMusd() {
  const { address, walletClient } = useWallet();
  const [balance, setBalance] = useState(0);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(0);
      return;
    }
    try {
      const bal = (await publicClient.readContract({
        address: MUSD,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      setBalance(Number(formatUnits(bal, DECIMALS)));
    } catch {
      /* leave previous value */
    }
  }, [address]);

  useEffect(() => {
    refresh();
    return onBalancesChanged(refresh);
  }, [refresh]);

  const mint = useCallback(
    async (amount: number) => {
      if (!walletClient || !address) {
        setError("Connect your wallet first.");
        return;
      }
      setMinting(true);
      setError(null);
      try {
        const hash = await walletClient.writeContract({
          account: address,
          chain: walletClient.chain,
          address: MUSD,
          abi: erc20Abi,
          functionName: "mint",
          args: [address, parseUnits(String(amount), DECIMALS)],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        await refresh();
        emitBalancesChanged();
      } catch (err) {
        setError((err as { shortMessage?: string }).shortMessage ?? "Mint failed.");
      } finally {
        setMinting(false);
      }
    },
    [walletClient, address, refresh],
  );

  return { balance, minting, error, mint, refresh };
}
