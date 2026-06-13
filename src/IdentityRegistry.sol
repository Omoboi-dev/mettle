// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

/// @title IdentityRegistry — ERC-8004 Identity Registry
/// @notice Each agent is an ERC-721 token whose `tokenId` is its `agentId`. The token owner
///         controls the agent; an optional `agentWallet` is the operational signer the agent
///         acts from (e.g. the address allowed to call a StrategyVault's `trade`).
/// @dev Implements the subset of EIP-8004 Identity this project uses. The full spec's
///      signature-based `setAgentWallet` is simplified here to an owner-only setter.
contract IdentityRegistry is ERC721URIStorage, IIdentityRegistry {
    /// @dev agentIds start at 1 so that 0 can mean "no agent".
    uint256 private _nextAgentId = 1;

    /// @notice Operational wallet per agent. Defaults to the owner if never set.
    mapping(uint256 => address) private _agentWallet;

    /// @notice Free-form on-chain metadata per agent (key => value).
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    event AgentWalletSet(uint256 indexed agentId, address indexed wallet);
    event MetadataSet(uint256 indexed agentId, string key, bytes value);

    error NotAgentOwner(uint256 agentId, address caller);

    constructor() ERC721("Mettle Agent", "MTL-AGENT") {}

    // --------------------------------------------------------------------- //
    //                              Registration                             //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IIdentityRegistry
    function register(string calldata agentURI, MetadataEntry[] calldata metadata)
        external
        returns (uint256 agentId)
    {
        agentId = _mintAgent(msg.sender, agentURI);
        for (uint256 i = 0; i < metadata.length; i++) {
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
            emit MetadataSet(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    /// @inheritdoc IIdentityRegistry
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, agentURI);
    }

    /// @inheritdoc IIdentityRegistry
    function register() external returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, "");
    }

    function _mintAgent(address to, string memory agentURI) internal returns (uint256 agentId) {
        agentId = _nextAgentId++;
        // _mint (not _safeMint): agents are frequently owned by contracts (multisigs,
        // factories) that don't implement onERC721Received, and we want no untrusted
        // callback during registration.
        _mint(to, agentId);
        if (bytes(agentURI).length != 0) {
            _setTokenURI(agentId, agentURI);
        }
        emit Registered(agentId, agentURI, to);
    }

    // --------------------------------------------------------------------- //
    //                                Mutators                               //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IIdentityRegistry
    function setAgentURI(uint256 agentId, string calldata newURI) external onlyAgentOwner(agentId) {
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /// @notice Set the agent's operational wallet (owner-only).
    function setAgentWallet(uint256 agentId, address wallet) external onlyAgentOwner(agentId) {
        _agentWallet[agentId] = wallet;
        emit AgentWalletSet(agentId, wallet);
    }

    /// @notice Set a metadata entry (owner-only).
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value)
        external
        onlyAgentOwner(agentId)
    {
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, value);
    }

    // --------------------------------------------------------------------- //
    //                                 Views                                 //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IIdentityRegistry
    /// @dev Falls back to the NFT owner when no operational wallet has been set.
    function getAgentWallet(uint256 agentId) external view returns (address) {
        address w = _agentWallet[agentId];
        return w == address(0) ? _requireOwner(agentId) : w;
    }

    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory) {
        return _metadata[agentId][key];
    }

    /// @notice Total number of agents registered so far.
    function totalAgents() external view returns (uint256) {
        return _nextAgentId - 1;
    }

    // --------------------------------------------------------------------- //
    //                                Helpers                                //
    // --------------------------------------------------------------------- //

    modifier onlyAgentOwner(uint256 agentId) {
        _onlyAgentOwner(agentId);
        _;
    }

    function _onlyAgentOwner(uint256 agentId) internal view {
        if (_requireOwner(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
    }

    /// @dev Reverts if the agent does not exist (ownerOf reverts on unminted tokens).
    function _requireOwner(uint256 agentId) internal view returns (address) {
        return ownerOf(agentId);
    }
}
