// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {StrategyVault} from "./StrategyVault.sol";
import {Market} from "./Market.sol";

/// @title AgentRunner — runs a full trading round (open → trade → settle) in one call
/// @notice Opens an epoch, trades, and settles in a single transaction, letting the vault write
///         the realized-PnL score — so a UI can trigger a live on-chain round with one click.
/// @dev Baseline harness: the move is a pseudo-random draw around a per-agent bias. The Mettle AI
///      layer reuses this plumbing but replaces the canned move with a real on-chain decision.
///      Must be each vault's `trader` and the Market owner (both wired at deploy).
contract AgentRunner {
    Market public immutable dex;
    address public immutable usd;

    address public owner;
    uint256 public basePrice = 100e6; // USD (6 decimals) per whole token at epoch open
    uint256 private _nonce;

    mapping(address => address) public tokenOf; // vault => the asset token it trades
    mapping(address => int256) public biasBps; // vault => skill bias in bps (e.g. +1500 = +15% mean)

    event AgentConfigured(address indexed vault, address indexed token, int256 biasBps);
    event EpochRun(address indexed vault, address indexed token, int256 moveBps, uint8 score);

    error NotOwner();
    error AgentNotConfigured(address vault);

    constructor(address dex_, address usd_) {
        dex = Market(dex_);
        usd = usd_;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ----------------------------- Admin ----------------------------- //

    function configureAgent(address vault, address token, int256 bias) external onlyOwner {
        tokenOf[vault] = token;
        biasBps[vault] = bias;
        emit AgentConfigured(vault, token, bias);
    }

    function setBasePrice(uint256 p) external onlyOwner {
        basePrice = p;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // --------------------------- Run a round -------------------------- //

    /// @notice Run one live trading round for `vault`. Public so anyone can trigger a round in the
    ///         demo; the outcome is pseudo-random around the vault's configured bias — NOT chosen
    ///         by the caller — so scores stay meaningful.
    function runEpoch(address vault) external returns (uint8 score) {
        return _run(vault, _moveBps(vault));
    }

    /// @notice Owner-only deterministic round (used to seed clean initial track records).
    function runEpochManual(address vault, int256 moveBps) external onlyOwner returns (uint8 score) {
        return _run(vault, _clamp(moveBps));
    }

    // ----------------------------- Internal --------------------------- //

    function _run(address vaultAddr, int256 move) internal returns (uint8 score) {
        address token = tokenOf[vaultAddr];
        if (token == address(0)) revert AgentNotConfigured(vaultAddr);
        StrategyVault vault = StrategyVault(vaultAddr);
        string memory uri = "ipfs://live-epoch";

        // Open the epoch (snapshots starting USD, opens the on-chain validation request).
        vault.startEpoch(uri);

        // Buy: deploy all tradable USD into the token at the base price.
        dex.setPrice(token, basePrice);
        uint256 amt = vault.tradableUSD();
        vault.trade(usd, token, amt, 0);

        // Market move, then sell everything back to USD (vault must be flat to settle).
        dex.setPrice(token, _apply(basePrice, move));
        uint256 held = vault.accountedHoldings(token);
        vault.trade(token, usd, held, 0);

        // Settle: the vault computes realized P&L and writes the 0–100 score on-chain.
        (, score) = vault.settleEpoch(uri, keccak256(abi.encode(vaultAddr, block.number, _nonce)));
        emit EpochRun(vaultAddr, token, move, score);
    }

    /// @dev Pseudo-random move (±20%) around the vault's bias, clamped to ±50% (score range).
    function _moveBps(address vault) internal returns (int256) {
        uint256 r = uint256(keccak256(abi.encode(block.prevrandao, block.timestamp, vault, _nonce++)));
        int256 rand = int256(r % 4001) - 2000; // -2000..+2000 bps
        return _clamp(biasBps[vault] + rand);
    }

    function _clamp(int256 move) internal pure returns (int256) {
        if (move > 5000) return 5000; // +50% -> score 100
        if (move < -5000) return -5000; // -50% -> score 0
        return move;
    }

    function _apply(uint256 price, int256 bps) internal pure returns (uint256) {
        int256 np = (int256(price) * (10000 + bps)) / 10000;
        return np < 1 ? 1 : uint256(np);
    }
}
