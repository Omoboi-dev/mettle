import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, custom, type WalletClient } from "viem";
import { mantleSepolia } from "../lib/chain";
import { CHAIN_ID, RPC_URLS } from "../data/deployment";

// Minimal EIP-1193 provider shape (MetaMask, Rabby, etc. inject this as window.ethereum).
interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;
const DISCONNECT_KEY = "mettle.wallet.disconnected";

interface WalletState {
  address?: `0x${string}`;
  chainId?: number;
  isCorrectChain: boolean;
  hasWallet: boolean;
  connecting: boolean;
  error: string | null;
  walletClient: WalletClient | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [chainId, setChainId] = useState<number | undefined>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const hasWallet = Boolean(provider);

  const refreshChain = useCallback(async () => {
    if (!provider) return;
    const id = (await provider.request({ method: "eth_chainId" })) as string;
    setChainId(parseInt(id, 16));
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) {
      setError("No wallet found. Install MetaMask to deposit.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts[0] as `0x${string}`);
      localStorage.removeItem(DISCONNECT_KEY);
      await refreshChain();
    } catch {
      setError("Connection rejected.");
    } finally {
      setConnecting(false);
    }
  }, [provider, refreshChain]);

  const disconnect = useCallback(() => {
    setAddress(undefined);
    localStorage.setItem(DISCONNECT_KEY, "1");
  }, []);

  // Restore an existing connection on load (no popup) so a refresh doesn't drop the wallet — unless
  // the user explicitly disconnected last time.
  useEffect(() => {
    if (!provider || localStorage.getItem(DISCONNECT_KEY)) return;
    (async () => {
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      if (accounts.length) {
        setAddress(accounts[0] as `0x${string}`);
        await refreshChain();
      }
    })();
  }, [provider, refreshChain]);

  const switchChain = useCallback(async () => {
    if (!provider) return;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch (err) {
      // 4902 = chain not added yet; add it then switch.
      if ((err as { code?: number }).code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_HEX,
              chainName: "Mantle Sepolia",
              nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
              rpcUrls: RPC_URLS,
              blockExplorerUrls: ["https://sepolia.mantlescan.xyz"],
            },
          ],
        });
      }
    }
    await refreshChain();
  }, [provider, refreshChain]);

  // React to account / chain changes in the wallet.
  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAddress(accounts[0] as `0x${string}` | undefined);
    };
    const onChain = (...args: unknown[]) => setChainId(parseInt(args[0] as string, 16));
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [provider]);

  const walletClient = useMemo<WalletClient | null>(() => {
    if (!provider || !address) return null;
    return createWalletClient({ account: address, chain: mantleSepolia, transport: custom(provider) });
  }, [provider, address]);

  const value: WalletState = {
    address,
    chainId,
    isCorrectChain: chainId === CHAIN_ID,
    hasWallet,
    connecting,
    error,
    walletClient,
    connect,
    disconnect,
    switchChain,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
