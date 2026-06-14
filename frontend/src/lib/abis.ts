import { parseAbi, parseAbiItem } from "viem";

export const decisionExecutedEvent = parseAbiItem(
  "event DecisionExecuted(address indexed vault, uint256 indexed agentId, address indexed asset, uint16 sizeBps, int256 moveBps, uint8 score, string rationaleURI, bytes32 rationaleHash)",
);

export const aiRunnerAbi = parseAbi([
  "function lastDecision(address vault) view returns (uint256 epoch, address asset, uint16 sizeBps, int256 moveBps, uint8 score, bytes32 rationaleHash, string rationaleURI, uint64 timestamp)",
  "event DecisionExecuted(address indexed vault, uint256 indexed agentId, address indexed asset, uint16 sizeBps, int256 moveBps, uint8 score, string rationaleURI, bytes32 rationaleHash)",
]);

export const validationAbi = parseAbi([
  "function getSummary(uint256 agentId, address[] validatorAddresses, string tag) view returns (uint64 count, uint8 averageResponse)",
]);

export const vaultAbi = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function agentId() view returns (uint256)",
  "function epochId() view returns (uint256)",
  "function epochActive() view returns (bool)",
]);

export const allocationAbi = parseAbi(["function eligibleWeight(address vault) view returns (uint256)"]);
