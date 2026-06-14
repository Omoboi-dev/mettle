// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {StrategyVault} from "./StrategyVault.sol";
import {Market} from "./Market.sol";

/// @title AIRunner — executes an AI agent's decision on-chain and records it
/// @notice Each round, an off-chain AI (Claude) reads real market data and chooses an asset and a
///         position size. This contract logs that decision on-chain, runs the epoch with the AI's
///         choice against the real market move, and lets the vault score the realized P&L. The
///         stored decision + emitted event are the agent's auditable on-chain inference record.
/// @dev Must be each AI vault's `trader` and the Market owner (both wired at deploy). The move is
///      the real market change for the chosen asset, supplied by the operator — the AI never sets
///      its own P&L, it only picks the asset and the size (its risk).
contract AIRunner {
    Market public immutable dex;
    address public immutable usd;

    address public owner;
    uint256 public basePrice = 100e6; // USD (6 decimals) per whole token at entry

    struct Decision {
        uint256 epoch;
        address asset;
        uint16 sizeBps; // fraction of capital deployed (0..10000); 0 = stayed in cash
        int256 moveBps; // realized market move applied this round
        uint8 score; // resulting 0..100 score
        bytes32 rationaleHash; // hash of the full AI rationale (stored off-chain)
        string rationaleURI; // pointer to the full rationale
        uint64 timestamp;
    }

    mapping(address => Decision) public lastDecision; // vault => latest AI decision

    event DecisionExecuted(
        address indexed vault,
        uint256 indexed agentId,
        address indexed asset,
        uint16 sizeBps,
        int256 moveBps,
        uint8 score,
        string rationaleURI,
        bytes32 rationaleHash
    );

    error NotOwner();
    error SizeTooLarge(uint16 sizeBps);

    constructor(address dex_, address usd_) {
        dex = Market(dex_);
        usd = usd_;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setBasePrice(uint256 p) external onlyOwner {
        basePrice = p;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Record and execute one AI decision for `vault`: log the choice, run the epoch with
    ///         the chosen asset, size and real move, and let the vault write the score.
    /// @param sizeBps fraction of the vault's capital to deploy (0 = stay in cash, 10000 = full).
    /// @param moveBps the real market move for `asset` this round (clamped to the score range).
    function runEpochAI(
        address vault,
        address asset,
        uint16 sizeBps,
        int256 moveBps,
        string calldata rationaleURI,
        bytes32 rationaleHash
    ) external onlyOwner returns (uint8 score) {
        if (sizeBps > 10_000) revert SizeTooLarge(sizeBps);
        StrategyVault v = StrategyVault(vault);

        v.startEpoch(rationaleURI);

        // Deploy the AI's chosen size into its chosen asset, let the real move play out, exit.
        uint256 amt = (v.tradableUSD() * sizeBps) / 10_000;
        if (amt > 0) {
            int256 move = _clamp(moveBps);
            dex.setPrice(asset, basePrice);
            v.trade(usd, asset, amt, 0);
            dex.setPrice(asset, _apply(basePrice, move));
            uint256 held = v.accountedHoldings(asset);
            v.trade(asset, usd, held, 0);
        }

        (, score) = v.settleEpoch(rationaleURI, rationaleHash);

        uint256 agentId = v.agentId();
        lastDecision[vault] = Decision({
            epoch: v.epochId(),
            asset: asset,
            sizeBps: sizeBps,
            moveBps: moveBps,
            score: score,
            rationaleHash: rationaleHash,
            rationaleURI: rationaleURI,
            timestamp: uint64(block.timestamp)
        });
        emit DecisionExecuted(vault, agentId, asset, sizeBps, moveBps, score, rationaleURI, rationaleHash);
    }

    /// @dev Clamp a move to the score range (+/-50%), so a bad price input can't produce a
    ///      nonsensical score.
    function _clamp(int256 move) internal pure returns (int256) {
        if (move > 5000) return 5000;
        if (move < -5000) return -5000;
        return move;
    }

    function _apply(uint256 price, int256 bps) internal pure returns (uint256) {
        int256 np = (int256(price) * (10000 + bps)) / 10000;
        return np < 1 ? 1 : uint256(np);
    }
}
