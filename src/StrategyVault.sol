// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IValidationRegistry} from "./interfaces/IValidationRegistry.sol";
import {IMarket} from "./interfaces/IMarket.sol";

/// @title StrategyVault — the "vault is the validator"
/// @notice A non-custodial vault for ONE agent. Capital providers deposit the base USD asset and
///         receive shares. The agent's `trader` key may move funds between USD and whitelisted
///         tradable tokens through the Market — but has NO way to send funds to itself. Each epoch
///         the vault computes the agent's REALIZED P&L on-chain (USD in vs USD out) and writes the
///         resulting 0–100 score to the ERC-8004 ValidationRegistry as the agent's designated
///         validator. The score is therefore impossible to fake.
///
/// @dev Epoch lifecycle keeps accounting trustless and oracle-free:
///      - Between epochs the vault is FLAT (holds only USD) → share pricing is unambiguous.
///      - `startEpoch` freezes deposits/withdrawals and snapshots the starting USD.
///      - The agent trades; before settling it must sell everything back to USD (flat).
///      - `settleEpoch` measures realized P&L = endUSD − startUSD, scores it, and reports it.
///      Because start and end are both fully in USD, the difference is realized P&L by
///      construction — no price oracle is ever trusted for the score.
///
///      For the vault to act as the agent's ERC-8004 validator, deployment must set this vault
///      as the agent's `agentWallet` (operator) in the IdentityRegistry. Then the vault can
///      open its own validation request and answer it.
contract StrategyVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ----------------------------- Immutables ----------------------------- //

    IERC20 public immutable usd; // base asset (6 decimals)
    uint256 public immutable agentId; // ERC-8004 identity
    address public immutable trader; // the only key allowed to call trade()
    IIdentityRegistry public immutable identity;
    IValidationRegistry public immutable validation;
    IMarket public immutable dex;

    // ------------------------------- Storage ------------------------------ //

    mapping(address => uint256) public shares; // depositor => shares
    uint256 public totalShares;

    /// @notice Accounted USD = principal in/out adjusted by realized epoch P&L.
    /// @dev This — NOT `usd.balanceOf` — is the source of truth for share pricing and the
    ///      score denominator. Using internal accounting makes both immune to donation
    ///      manipulation (a direct USD transfer can never inflate the score or a share price).
    uint256 public totalManagedUSD;

    address[] public tradableTokens; // whitelisted tradable tokens
    mapping(address => bool) public isTradable;

    bool public epochActive;
    uint256 public epochId; // increments each time an epoch starts
    uint256 public epochStartUSD; // managed-USD snapshot at epoch open (score denominator)
    /// @notice Realized P&L accumulated from USD trade legs during the active epoch.
    /// @dev Only swaps with a USD leg move this; donations to the vault do not. At settle
    ///      (vault flat) this equals the epoch's true realized trading P&L.
    int256 public epochTradePnL;
    /// @notice Accounted USD currently available to spend on buys this epoch (ring-fence).
    /// @dev Initialized to the epoch's starting managed USD and adjusted by USD trade legs.
    ///      Buys cannot exceed it, so DONATED (un-accounted) USD can never be deployed.
    uint256 public tradableUSD;
    /// @notice Accounted units of each token the vault actually bought (ring-fence).
    /// @dev A sell can only move accounted holdings, so DONATED tokens can never be sold, and
    ///      `_requireFlat` checks this ledger (not raw balanceOf) so a dust donation cannot
    ///      brick the vault. Together with `tradableUSD`, donations of ANY asset are inert.
    mapping(address => uint256) public accountedHoldings;

    // ------------------------------- Events ------------------------------- //

    event Deposited(address indexed user, uint256 usdIn, uint256 sharesOut);
    event Withdrawn(address indexed user, uint256 sharesIn, uint256 usdOut);
    event Traded(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event EpochStarted(uint256 indexed epochId, uint256 startUSD, bytes32 requestHash);
    event EpochSettled(uint256 indexed epochId, int256 realizedPnL, uint8 score, bytes32 requestHash);

    // ------------------------------- Errors ------------------------------- //

    error NotTrader();
    error NotTraderOrOwner();
    error EpochIsActive();
    error EpochNotActive();
    error DepositsFrozen();
    error VaultNotFlat(address token, uint256 balance);
    error EmptyVault();
    error ZeroAmount();
    error TokenNotAllowed(address token);
    error SameToken();
    error NothingToWithdraw();
    error ExceedsTradableUSD(uint256 amountIn, uint256 available);
    error ExceedsAccountedHoldings(address token, uint256 amountIn, uint256 available);
    error InvalidTradableToken(address token);

    constructor(
        address usd_,
        address identity_,
        address validation_,
        address dex_,
        uint256 agentId_,
        address trader_,
        address[] memory tradableTokens_
    ) {
        usd = IERC20(usd_);
        identity = IIdentityRegistry(identity_);
        validation = IValidationRegistry(validation_);
        dex = IMarket(dex_);
        agentId = agentId_;
        trader = trader_;
        for (uint256 i = 0; i < tradableTokens_.length; i++) {
            address token = tradableTokens_[i];
            // A tradable token must not be USD, the zero address, or a duplicate — otherwise
            // _requireFlat could permanently brick the vault or the set would be polluted.
            if (token == address(0) || token == usd_ || isTradable[token]) {
                revert InvalidTradableToken(token);
            }
            tradableTokens.push(token);
            isTradable[token] = true;
        }
    }

    // --------------------------- Capital in/out --------------------------- //

    /// @notice Deposit USD and receive shares. Frozen while an epoch is active.
    function deposit(uint256 amount) external nonReentrant returns (uint256 mintedShares) {
        if (epochActive) revert DepositsFrozen();
        if (amount == 0) revert ZeroAmount();

        // Share price uses internal accounting, not balanceOf (donation-proof). A fresh pool
        // (no shares) OR a fully-wiped pool (managed == 0) mints 1:1 to avoid div-by-zero.
        uint256 managed = totalManagedUSD;
        mintedShares = (totalShares == 0 || managed == 0) ? amount : (amount * totalShares) / managed;
        if (mintedShares == 0) revert ZeroAmount();

        // Effects before interaction (CEI).
        totalShares += mintedShares;
        shares[msg.sender] += mintedShares;
        totalManagedUSD = managed + amount;

        usd.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount, mintedShares);
    }

    /// @notice Burn shares and withdraw USD pro-rata. Frozen while an epoch is active.
    function withdraw(uint256 shareAmount) external nonReentrant returns (uint256 usdOut) {
        if (epochActive) revert DepositsFrozen();
        if (shareAmount == 0) revert ZeroAmount();
        uint256 userShares = shares[msg.sender];
        if (userShares < shareAmount) revert NothingToWithdraw();

        uint256 managed = totalManagedUSD;
        usdOut = (shareAmount * managed) / totalShares;

        // Effects before interaction (CEI).
        shares[msg.sender] = userShares - shareAmount;
        totalShares -= shareAmount;
        totalManagedUSD = managed - usdOut;

        usd.safeTransfer(msg.sender, usdOut);
        emit Withdrawn(msg.sender, shareAmount, usdOut);
    }

    // ------------------------------- Trading ------------------------------ //

    /// @notice The agent trades between USD and whitelisted tradable tokens via the Market.
    /// @dev Only the `trader` key. There is NO path here to send funds to an arbitrary
    ///      address — tokens only ever move vault → Market → vault. This is the non-custodial
    ///      guarantee: the agent can trade your money, never take it.
    function trade(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (msg.sender != trader) revert NotTrader();
        if (!epochActive) revert EpochNotActive();
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == tokenOut) revert SameToken();
        if (tokenIn != address(usd) && !isTradable[tokenIn]) revert TokenNotAllowed(tokenIn);
        if (tokenOut != address(usd) && !isTradable[tokenOut]) revert TokenNotAllowed(tokenOut);

        // Ring-fence the INPUT: the agent may only move capital the vault accounts for, so
        // donated USD or donated tokens can never enter the trade flow (or the score).
        if (tokenIn == address(usd)) {
            if (amountIn > tradableUSD) revert ExceedsTradableUSD(amountIn, tradableUSD);
        } else {
            if (amountIn > accountedHoldings[tokenIn]) {
                revert ExceedsAccountedHoldings(tokenIn, amountIn, accountedHoldings[tokenIn]);
            }
        }

        IERC20(tokenIn).forceApprove(address(dex), amountIn);
        amountOut = dex.swap(tokenIn, tokenOut, amountIn, minAmountOut);
        IERC20(tokenIn).forceApprove(address(dex), 0); // leave no residual allowance

        // Debit the input asset's accounted ledger.
        if (tokenIn == address(usd)) {
            tradableUSD -= amountIn;
            epochTradePnL -= int256(amountIn); // spent USD (buy)
        } else {
            accountedHoldings[tokenIn] -= amountIn;
        }
        // Credit the output asset's accounted ledger.
        if (tokenOut == address(usd)) {
            tradableUSD += amountOut;
            epochTradePnL += int256(amountOut); // received USD (sell)
        } else {
            accountedHoldings[tokenOut] += amountOut;
        }

        emit Traded(tokenIn, tokenOut, amountIn, amountOut);
    }

    // -------------------------- Epoch lifecycle --------------------------- //

    /// @notice Open a scoring epoch: snapshot starting USD, freeze flows, and open this
    ///         vault's ERC-8004 validation request (vault names itself as validator).
    function startEpoch(string calldata requestURI) external nonReentrant returns (bytes32 requestHash) {
        _onlyTraderOrOwner();
        if (epochActive) revert EpochIsActive();
        _requireFlat();

        uint256 startUSD = totalManagedUSD;
        if (startUSD == 0) revert EmptyVault();

        epochId += 1;
        epochStartUSD = startUSD;
        epochTradePnL = 0;
        tradableUSD = startUSD; // ring-fence: only accounted capital can be traded
        epochActive = true;

        requestHash = epochRequestHash(epochId);
        // Vault is the agent's operator → allowed to open the request; names itself validator.
        validation.validationRequest(address(this), agentId, requestURI, requestHash);
        emit EpochStarted(epochId, startUSD, requestHash);
    }

    /// @notice Close the epoch: requires the vault is flat (all positions sold to USD),
    ///         computes realized P&L, maps it to a 0–100 score, and writes it to the
    ///         ValidationRegistry as the agent's validator.
    function settleEpoch(string calldata responseURI, bytes32 responseHash)
        external
        nonReentrant
        returns (int256 realizedPnL, uint8 score)
    {
        _onlyTraderOrOwner();
        if (!epochActive) revert EpochNotActive();
        _requireFlat();

        // Realized P&L comes from the tracked USD trade legs, never from balanceOf — so a
        // direct USD donation to the vault cannot inflate the score.
        realizedPnL = epochTradePnL;
        score = _scoreFromPnL(realizedPnL, epochStartUSD);

        // Roll the epoch's realized P&L into the accounted principal (clamp at 0; a vault
        // cannot owe more than it managed).
        int256 newManaged = int256(totalManagedUSD) + realizedPnL;
        totalManagedUSD = newManaged < 0 ? 0 : uint256(newManaged);

        epochActive = false;

        bytes32 requestHash = epochRequestHash(epochId);
        validation.validationResponse(requestHash, score, responseURI, responseHash, "realizedPnL");
        emit EpochSettled(epochId, realizedPnL, score, requestHash);
    }

    // -------------------------------- Views ------------------------------- //

    /// @notice Accounted USD assets backing shares (donation-proof; not raw balanceOf).
    function totalAssets() external view returns (uint256) {
        return totalManagedUSD;
    }

    /// @notice Raw USD token balance held by the vault (may exceed totalAssets if donated).
    function usdBalance() external view returns (uint256) {
        return usd.balanceOf(address(this));
    }

    function tradableTokenCount() external view returns (uint256) {
        return tradableTokens.length;
    }

    /// @notice Deterministic request hash for an epoch (opener and responder agree on it).
    function epochRequestHash(uint256 epochId_) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), agentId, epochId_));
    }

    // ------------------------------- Internal ----------------------------- //

    /// @dev Maps realized P&L to a score in [0,100], centered at 50 (= breakeven).
    ///      score = 50 + percentReturn, clamped. e.g. +50% → 100, 0% → 50, −50% → 0.
    function _scoreFromPnL(int256 pnl, uint256 startUSD) internal pure returns (uint8) {
        int256 returnBps = (pnl * 10_000) / int256(startUSD);
        int256 score = 50 + returnBps / 100; // returnBps/100 == percent return
        if (score < 0) score = 0;
        if (score > 100) score = 100;
        return uint8(uint256(score));
    }

    /// @dev Revert unless every accounted position is closed (vault fully in USD).
    ///      Uses the accounted ledger, NOT raw balanceOf, so a dust donation of a token
    ///      cannot brick startEpoch/settleEpoch.
    function _requireFlat() internal view {
        for (uint256 i = 0; i < tradableTokens.length; i++) {
            uint256 pos = accountedHoldings[tradableTokens[i]];
            if (pos != 0) revert VaultNotFlat(tradableTokens[i], pos);
        }
    }

    function _onlyTraderOrOwner() internal view {
        if (msg.sender != trader && msg.sender != identity.ownerOf(agentId)) {
            revert NotTraderOrOwner();
        }
    }
}
