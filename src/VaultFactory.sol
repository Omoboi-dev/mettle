// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {StrategyVault} from "./StrategyVault.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IValidationRegistry} from "./interfaces/IValidationRegistry.sol";
import {IMarket} from "./interfaces/IMarket.sol";

/// @title VaultFactory — launches official, trustable StrategyVaults
/// @notice `launchAgent` atomically registers an ERC-8004 agent, deploys its StrategyVault, wires
///         the vault as the agent's operator (so it can score itself), marks it OFFICIAL, and
///         hands the agent NFT to the caller.
/// @dev `isOfficialVault` is the system's trust anchor: consumers must only count validation
///      scores whose validator is a vault from this factory, which stops an owner from naming
///      themselves validator and self-reporting a fake score. The factory registers the agent
///      itself (momentary owner) to set the wallet, then transfers the NFT to the caller.
contract VaultFactory {
    IIdentityRegistry public immutable identity;
    IValidationRegistry public immutable validation;
    IMarket public immutable dex;
    address public immutable usd;

    /// @notice The shared set of tradable tokens every vault is launched with.
    address[] public tradableTokens;

    /// @notice The trust anchor: true only for vaults this factory deployed.
    mapping(address => bool) public isOfficialVault;
    address[] public allVaults;
    mapping(uint256 => address) public vaultOf; // agentId => vault

    event VaultLaunched(
        uint256 indexed agentId, address indexed vault, address indexed owner, address trader
    );

    error EmptyTradableSet();
    error InvalidTradableToken(address token);
    error ZeroTrader();
    error ZeroAddress();

    constructor(
        address usd_,
        address identity_,
        address validation_,
        address dex_,
        address[] memory tradableTokens_
    ) {
        if (usd_ == address(0) || identity_ == address(0) || validation_ == address(0) || dex_ == address(0))
        {
            revert ZeroAddress();
        }
        if (tradableTokens_.length == 0) revert EmptyTradableSet();
        usd = usd_;
        identity = IIdentityRegistry(identity_);
        validation = IValidationRegistry(validation_);
        dex = IMarket(dex_);

        // Validate the shared tradable set up front so launches can't all silently revert later.
        for (uint256 i = 0; i < tradableTokens_.length; i++) {
            address token = tradableTokens_[i];
            if (token == address(0) || token == usd_) revert InvalidTradableToken(token);
            for (uint256 j = 0; j < i; j++) {
                if (tradableTokens_[j] == token) revert InvalidTradableToken(token);
            }
            tradableTokens.push(token);
        }
    }

    /// @notice Launch a new agent and its official vault in one transaction. The agent NFT is
    ///         transferred to the caller, who becomes the agent owner.
    /// @param agentURI off-chain metadata URI for the agent (name, strategy, etc.).
    /// @param trader the key the agent's bot will trade from (only address allowed to trade()).
    /// @return agentId the new ERC-8004 agent id.
    /// @return vault the deployed StrategyVault address.
    function launchAgent(string calldata agentURI, address trader)
        external
        returns (uint256 agentId, address vault)
    {
        if (trader == address(0)) revert ZeroTrader();

        // Factory registers the agent → it is the momentary owner, which lets it set the wallet.
        agentId = identity.register(agentURI);

        StrategyVault v = new StrategyVault(
            usd, address(identity), address(validation), address(dex), agentId, trader, tradableTokens
        );
        vault = address(v);

        // Wire the vault as the agent's operator so it can open & answer its own validations.
        identity.setAgentWallet(agentId, vault);

        // Record as official BEFORE handing over ownership.
        isOfficialVault[vault] = true;
        allVaults.push(vault);
        vaultOf[agentId] = vault;

        // Hand the agent NFT to the caller (non-safe transfer: no receiver callback needed,
        // and the caller may be a contract that doesn't implement onERC721Received).
        identity.transferFrom(address(this), msg.sender, agentId);

        emit VaultLaunched(agentId, vault, msg.sender, trader);
    }

    // -------------------------------- Views ------------------------------- //

    /// @notice All official vault addresses (for leaderboards / allocation filtering).
    function officialVaults() external view returns (address[] memory) {
        return allVaults;
    }

    function vaultCount() external view returns (uint256) {
        return allVaults.length;
    }

    function tradableTokenCount() external view returns (uint256) {
        return tradableTokens.length;
    }
}
