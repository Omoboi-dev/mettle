import { parseAbi } from "viem";

export const aiRunnerAbi = parseAbi([
  "function runEpochAI(address vault, address asset, uint16 sizeBps, int256 moveBps, string rationaleURI, bytes32 rationaleHash) returns (uint8 score)",
  "function owner() view returns (address)",
  "function lastDecision(address vault) view returns (uint256 epoch, address asset, uint16 sizeBps, int256 moveBps, uint8 score, bytes32 rationaleHash, string rationaleURI, uint64 timestamp)",
]);

export const vaultAbi = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function agentId() view returns (uint256)",
  "function epochId() view returns (uint256)",
]);

export const allocationControllerAbi = parseAbi([
  "function owner() view returns (address)",
  "function idleUSD() view returns (uint256)",
  "function totalNAV() view returns (uint256)",
  "function deployedVaultCount() view returns (uint256)",
  "function allocate(address[] candidates, uint256 amountToDeploy)",
  "function recall(address[] vaults)",
]);
