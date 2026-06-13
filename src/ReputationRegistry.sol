// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

/// @title ReputationRegistry — ERC-8004 Reputation Registry
/// @notice Clients (e.g. depositors) post scored feedback about an agent. Signals are kept
///         on-chain for composability; rich data lives off-chain (feedbackURI + hash).
/// @dev In Mettle this is the SECONDARY trust signal — the primary, trustless score is the
///      realized-PnL score in the ValidationRegistry. Feedback values are signed fixed-point
///      numbers; `getSummary` normalizes them to 18 decimals before averaging.
contract ReputationRegistry is IReputationRegistry {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }

    IIdentityRegistry private immutable _identity;

    /// @dev agentId => client => list of feedback entries.
    mapping(uint256 => mapping(address => Feedback[])) private _feedback;
    /// @dev agentId => distinct clients who have ever given feedback (for enumeration).
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _isClient;

    error InvalidValueDecimals(uint8 valueDecimals);
    error SelfFeedbackNotAllowed();
    error FeedbackIndexOutOfRange();

    error ZeroIdentityRegistry();

    constructor(address identityRegistry_) {
        if (identityRegistry_ == address(0)) revert ZeroIdentityRegistry();
        _identity = IIdentityRegistry(identityRegistry_);
    }

    // --------------------------------------------------------------------- //
    //                                Mutators                               //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IReputationRegistry
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        if (valueDecimals > 18) revert InvalidValueDecimals(valueDecimals);

        // Reverts if the agent does not exist; also gives us the controllers to exclude.
        // Block the owner, the operational wallet, AND any ERC-721 approved operator, so an
        // owner can't self-rate through an approved address.
        address owner = _identity.ownerOf(agentId);
        if (
            msg.sender == owner || msg.sender == _identity.getAgentWallet(agentId)
                || _identity.getApproved(agentId) == msg.sender
                || _identity.isApprovedForAll(owner, msg.sender)
        ) {
            revert SelfFeedbackNotAllowed();
        }

        Feedback[] storage list = _feedback[agentId][msg.sender];
        uint64 feedbackIndex = uint64(list.length);
        list.push(
            Feedback({value: value, valueDecimals: valueDecimals, tag1: tag1, tag2: tag2, isRevoked: false})
        );

        if (!_isClient[agentId][msg.sender]) {
            _isClient[agentId][msg.sender] = true;
            _clients[agentId].push(msg.sender);
        }

        emit NewFeedback(
            agentId, msg.sender, feedbackIndex, value, valueDecimals, tag1, tag1, tag2, endpoint, feedbackURI, feedbackHash
        );
    }

    /// @notice Revoke one of your own feedback entries (excluded from summaries).
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        Feedback[] storage list = _feedback[agentId][msg.sender];
        if (feedbackIndex >= list.length) revert FeedbackIndexOutOfRange();
        list[feedbackIndex].isRevoked = true;
    }

    // --------------------------------------------------------------------- //
    //                                 Views                                 //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IReputationRegistry
    /// @param clientAddresses if empty, every client who rated the agent is included.
    /// @param tag1 if empty, matches any tag1 (same for tag2).
    /// @return count number of (non-revoked, matching) feedback entries.
    /// @return summaryValue average value normalized to 18 decimals.
    /// @return summaryValueDecimals always 18.
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        address[] memory clients;
        if (clientAddresses.length == 0) {
            clients = _clients[agentId];
        } else {
            clients = clientAddresses;
        }
        bool anyTag1 = bytes(tag1).length == 0;
        bool anyTag2 = bytes(tag2).length == 0;
        bytes32 t1 = keccak256(bytes(tag1));
        bytes32 t2 = keccak256(bytes(tag2));

        int256 sum18;
        uint256 n;
        for (uint256 i = 0; i < clients.length; i++) {
            Feedback[] storage list = _feedback[agentId][clients[i]];
            for (uint256 j = 0; j < list.length; j++) {
                Feedback storage f = list[j];
                if (f.isRevoked) continue;
                if (!anyTag1 && keccak256(bytes(f.tag1)) != t1) continue;
                if (!anyTag2 && keccak256(bytes(f.tag2)) != t2) continue;
                // normalize value to 18 decimals
                sum18 += int256(f.value) * int256(10 ** (18 - f.valueDecimals));
                n++;
            }
        }

        count = uint64(n);
        summaryValueDecimals = 18;
        summaryValue = n == 0 ? int128(0) : int128(sum18 / int256(n));
    }

    /// @inheritdoc IReputationRegistry
    function getIdentityRegistry() external view returns (address) {
        return address(_identity);
    }

    /// @notice Distinct clients that have rated an agent.
    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    /// @notice Read a single feedback entry.
    function readFeedback(uint256 agentId, address client, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        Feedback storage f = _feedback[agentId][client][feedbackIndex];
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.isRevoked);
    }
}
