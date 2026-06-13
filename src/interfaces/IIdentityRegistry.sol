// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title IIdentityRegistry — ERC-8004 Identity Registry (subset)
/// @notice Each agent is an ERC-721 token whose tokenId is the agentId.
/// @dev Faithful to EIP-8004 v1 (https://eips.ethereum.org/EIPS/eip-8004).
///      Only the members this project needs are declared here. Extends IERC721 so
///      `ownerOf` (and the rest of the NFT surface) is available through this interface.
interface IIdentityRegistry is IERC721 {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    /// @notice Register a new agent. Mints an ERC-721 to msg.sender.
    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId);

    function register(string calldata agentURI) external returns (uint256 agentId);

    function register() external returns (uint256 agentId);

    function setAgentURI(uint256 agentId, string calldata newURI) external;

    /// @notice Set the agent's operational wallet (owner-only in the implementation).
    function setAgentWallet(uint256 agentId, address wallet) external;

    /// @notice The operational wallet an agent signs/acts from (may differ from NFT owner).
    function getAgentWallet(uint256 agentId) external view returns (address);

    // ownerOf(uint256) is inherited from IERC721.
}
