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
  "function shares(address) view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function deposit(uint256 amount) returns (uint256 mintedShares)",
  "function withdraw(uint256 shareAmount) returns (uint256 usdOut)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);

export const allocationAbi = parseAbi([
  "function eligibleWeight(address vault) view returns (uint256)",
  "function shares(address) view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function totalNAV() view returns (uint256)",
  "function idleUSD() view returns (uint256)",
  "function deposit(uint256 amount) returns (uint256 mintedShares)",
  "function withdraw(uint256 shareAmount) returns (uint256 usdOut)",
]);
