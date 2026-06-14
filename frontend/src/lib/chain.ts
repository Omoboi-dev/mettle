import { createPublicClient, defineChain, fallback, http } from "viem";
import { CHAIN_ID, RPC_URLS } from "../data/deployment";

export const mantleSepolia = defineChain({
  id: CHAIN_ID,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: RPC_URLS } },
  blockExplorers: { default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" } },
});

// A read-only client with a fallback across endpoints, since the public Mantle RPC can be flaky.
export const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: fallback(RPC_URLS.map((u) => http(u)), { rank: false }),
});
