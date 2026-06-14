// Live Mantle Sepolia deployment. Mirrors the repo-root deployed.json so the frontend can be
// deployed and hosted on its own without reaching back into the contracts package.

export const CHAIN_ID = 5003;
export const EXPLORER = "https://sepolia.mantlescan.xyz";

export const RPC_URLS = ["https://rpc.sepolia.mantle.xyz", "https://mantle-sepolia.drpc.org"];

export const TOKENS = {
  mUSD: "0xff07456a1aeb7b4d0e316bf1f9540776dc4a6ae6",
  mETH: "0xa86c2a63a31ea4cd4c18aa93d4141aaa6c7d850a",
  fBTC: "0x6b749be0c8f854a6055f3e5fc683a4054934c8b3",
  MNT: "0x3c9a17c1ea48ad171e6c5837a98994db359eb54f",
  USDY: "0xa3811d3202f1c793a1cfcf7585f87d4f566d7a1f",
  MI4: "0x45a0cfdf38e93cb5a074bece4ae9c5b738f24b92",
} as const;

export const CORE = {
  Market: "0xba61bbdc03c3df64e256186c5187e52b09262dc2",
  IdentityRegistry: "0xd279d843ccc1908bbf1f470fe37e2b22155300b1",
  ReputationRegistry: "0xcd474c41a48ffa6b6296899827f8b274e1c0a56d",
  ValidationRegistry: "0xd4296d8ced0644fa29615e3d342853ee955e696a",
  VaultFactory: "0x6c5f6f0e683dad2b318b78d0eb1bef816f55d895",
  AIRunner: "0xb3b1a270be197a46ab2c63c41e700fdb07be7f6e",
  AllocationController: "0x5843d11bb0d95cb16ce1ba1fa9448ffac5fcbef5",
} as const;

/** Map a token address back to its symbol (for decoding decisions). CASH = the zero/USD case. */
export function assetForAddress(addr: string): keyof typeof TOKENS | undefined {
  const lower = addr.toLowerCase();
  return (Object.keys(TOKENS) as (keyof typeof TOKENS)[]).find((k) => TOKENS[k].toLowerCase() === lower);
}
