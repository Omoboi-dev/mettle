// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IReputationRegistry — ERC-8004 Reputation Registry (subset)
/// @notice Clients post scored feedback about an agent; signals are stored on-chain
///         for composability while rich data lives off-chain (feedbackURI + hash).
/// @dev Faithful to EIP-8004 v1. value is a signed fixed-point number with valueDecimals (0-18).
interface IReputationRegistry {
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    /// @notice Post feedback about an agent. Caller must not be the agent owner/operator.
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    /// @notice Aggregated view of feedback for an agent filtered by clients/tags.
    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);

    function getIdentityRegistry() external view returns (address identityRegistry);
}
