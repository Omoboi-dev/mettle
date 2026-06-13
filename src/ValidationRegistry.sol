// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IValidationRegistry} from "./interfaces/IValidationRegistry.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

/// @title ValidationRegistry — ERC-8004 Validation Registry
/// @notice Records independent verification of an agent's work as a score in [0,100].
/// @dev This is the PRIMARY, trustless trust anchor of Mettle. An agent owner opens a request
///      naming a `validator`; only that validator may answer. In our system the registered
///      validator is the agent's StrategyVault, which can only report the realized PnL score
///      its own on-chain accounting computed — so the score is unfakeable.
contract ValidationRegistry is IValidationRegistry {
    struct Validation {
        address validator;
        uint256 agentId;
        uint8 response;
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool exists; // request was opened
        bool answered; // validator has responded at least once
    }

    IIdentityRegistry private immutable _identity;

    mapping(bytes32 => Validation) private _validation; // requestHash => record
    mapping(uint256 => bytes32[]) private _agentRequests; // agentId => requestHashes
    mapping(address => bytes32[]) private _validatorRequests; // validator => requestHashes

    error NotAgentController(uint256 agentId, address caller);
    error ZeroValidator();
    error RequestAlreadyExists(bytes32 requestHash);
    error UnknownRequest(bytes32 requestHash);
    error NotDesignatedValidator(bytes32 requestHash, address caller);
    error ResponseOutOfRange(uint8 response);
    error ZeroIdentityRegistry();

    constructor(address identityRegistry_) {
        if (identityRegistry_ == address(0)) revert ZeroIdentityRegistry();
        _identity = IIdentityRegistry(identityRegistry_);
    }

    // --------------------------------------------------------------------- //
    //                                Requests                               //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IValidationRegistry
    /// @dev Callable by the agent owner or its operational wallet. `requestHash` is the unique
    ///      key (e.g. keccak of "agentId|epochId|..."); it cannot be reused.
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        if (validatorAddress == address(0)) revert ZeroValidator();

        address owner = _identity.ownerOf(agentId); // reverts if agent doesn't exist
        if (msg.sender != owner && msg.sender != _identity.getAgentWallet(agentId)) {
            revert NotAgentController(agentId, msg.sender);
        }
        if (_validation[requestHash].exists) revert RequestAlreadyExists(requestHash);

        _validation[requestHash] = Validation({
            validator: validatorAddress,
            agentId: agentId,
            response: 0,
            responseHash: bytes32(0),
            tag: "",
            lastUpdate: block.timestamp,
            exists: true,
            answered: false
        });
        _agentRequests[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    // --------------------------------------------------------------------- //
    //                                Responses                              //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IValidationRegistry
    /// @dev Callable ONLY by the validator named in the request. May be called multiple times
    ///      (e.g. once per settled epoch) to update the score.
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        Validation storage v = _validation[requestHash];
        if (!v.exists) revert UnknownRequest(requestHash);
        if (msg.sender != v.validator) revert NotDesignatedValidator(requestHash, msg.sender);
        if (response > 100) revert ResponseOutOfRange(response);

        v.response = response;
        v.responseHash = responseHash;
        v.tag = tag;
        v.lastUpdate = block.timestamp;
        v.answered = true;

        emit ValidationResponse(v.validator, v.agentId, requestHash, response, responseURI, responseHash, tag);
    }

    // --------------------------------------------------------------------- //
    //                                 Views                                 //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IValidationRegistry
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
        )
    {
        Validation storage v = _validation[requestHash];
        return (v.validator, v.agentId, v.response, v.responseHash, v.tag, v.lastUpdate);
    }

    /// @inheritdoc IValidationRegistry
    /// @param validatorAddresses if empty, all validators count.
    /// @param tag if empty, all tags count.
    /// @return count number of answered, matching validations for the agent.
    /// @return averageResponse mean score in [0,100] (0 when count == 0).
    function getSummary(uint256 agentId, address[] calldata validatorAddresses, string calldata tag)
        external
        view
        returns (uint64 count, uint8 averageResponse)
    {
        bytes32[] storage hashes = _agentRequests[agentId];
        bool anyValidator = validatorAddresses.length == 0;
        bool anyTag = bytes(tag).length == 0;
        bytes32 tagHash = keccak256(bytes(tag));

        uint256 sum;
        uint256 n;
        for (uint256 i = 0; i < hashes.length; i++) {
            Validation storage v = _validation[hashes[i]];
            if (!v.answered) continue;
            if (!anyTag && keccak256(bytes(v.tag)) != tagHash) continue;
            if (!anyValidator && !_contains(validatorAddresses, v.validator)) continue;
            sum += v.response;
            n++;
        }

        count = uint64(n);
        averageResponse = n == 0 ? 0 : uint8(sum / n);
    }

    /// @notice All request hashes opened for an agent.
    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentRequests[agentId];
    }

    /// @notice All request hashes a validator is responsible for.
    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return _validatorRequests[validatorAddress];
    }

    function getIdentityRegistry() external view returns (address) {
        return address(_identity);
    }

    function _contains(address[] calldata set, address who) private pure returns (bool) {
        for (uint256 i = 0; i < set.length; i++) {
            if (set[i] == who) return true;
        }
        return false;
    }
}
