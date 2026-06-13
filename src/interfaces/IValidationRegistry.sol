// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IValidationRegistry — ERC-8004 Validation Registry (subset)
/// @notice Records independent verification of an agent's work. A validator answers a
///         request with a score in [0, 100]. THIS is the hook our StrategyVault plugs into:
///         the vault is itself the validator, posting provable on-chain PnL as the response.
/// @dev Faithful to EIP-8004 v1.
interface IValidationRegistry {
    event ValidationRequest(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestURI,
        bytes32 indexed requestHash
    );

    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    /// @notice Open a validation request. Callable by the agent owner/operator.
    /// @param validatorAddress the address allowed to answer (our StrategyVault).
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external;

    /// @notice Answer a validation request. Callable ONLY by the named validatorAddress.
    /// @param response score in [0,100]. Multiple responses per requestHash allowed.
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external;

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        );

    /// @notice Aggregated validation score for an agent (count + average response).
    function getSummary(uint256 agentId, address[] calldata validatorAddresses, string calldata tag)
        external
        view
        returns (uint64 count, uint8 averageResponse);
}
