// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";

/// @notice Direct unit tests for the three ERC-8004 registries: access control, edge cases,
///         and — most importantly — the ValidationRegistry trust-filter that the whole system
///         relies on (only a named validator can score, and summaries can exclude rogue ones).
contract RegistriesTest is Test {
    IdentityRegistry identity;
    ReputationRegistry reputation;
    ValidationRegistry validation;

    address owner = makeAddr("owner");
    address client = makeAddr("client");
    address client2 = makeAddr("client2");
    address vault = makeAddr("vault"); // stands in for a StrategyVault validator
    address stranger = makeAddr("stranger");

    function setUp() public {
        identity = new IdentityRegistry();
        reputation = new ReputationRegistry(address(identity));
        validation = new ValidationRegistry(address(identity));
    }

    function _registerAgent() internal returns (uint256 agentId) {
        vm.prank(owner);
        agentId = identity.register("ipfs://agent");
    }

    // ====================================================================== //
    //                            IdentityRegistry                            //
    // ====================================================================== //

    function test_Identity_RegisterMintsSequentialIdsToCaller() public {
        vm.prank(owner);
        uint256 id1 = identity.register("a");
        vm.prank(owner);
        uint256 id2 = identity.register("b");
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(identity.ownerOf(id1), owner);
        assertEq(identity.totalAgents(), 2);
        assertEq(identity.tokenURI(id1), "a");
    }

    function test_Identity_AgentWalletDefaultsToOwnerThenOverrides() public {
        uint256 id = _registerAgent();
        assertEq(identity.getAgentWallet(id), owner, "defaults to owner");

        vm.prank(owner);
        identity.setAgentWallet(id, vault);
        assertEq(identity.getAgentWallet(id), vault);
    }

    function test_Identity_SetAgentWallet_OnlyOwner() public {
        uint256 id = _registerAgent();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IdentityRegistry.NotAgentOwner.selector, id, stranger));
        identity.setAgentWallet(id, vault);
    }

    function test_Identity_SetMetadata_OnlyOwner_AndReadBack() public {
        uint256 id = _registerAgent();
        vm.prank(owner);
        identity.setMetadata(id, "strategy", bytes("momentum"));
        assertEq(identity.getMetadata(id, "strategy"), bytes("momentum"));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IdentityRegistry.NotAgentOwner.selector, id, stranger));
        identity.setMetadata(id, "strategy", bytes("hacked"));
    }

    function test_Identity_OwnerOfRevertsForNonexistent() public {
        vm.expectRevert();
        identity.ownerOf(999);
    }

    // ====================================================================== //
    //                           ReputationRegistry                           //
    // ====================================================================== //

    function test_Reputation_GiveFeedback_StoresAndSummarizes() public {
        uint256 id = _registerAgent();
        vm.prank(client);
        reputation.giveFeedback(id, int128(80), 0, "quality", "", "", "", bytes32(0));

        (uint64 count, int128 summaryValue, uint8 dec) = reputation.getSummary(id, new address[](0), "", "");
        assertEq(count, 1);
        assertEq(int256(summaryValue), int256(80e18), "normalized to 18 decimals");
        assertEq(dec, 18);
    }

    function test_Reputation_AveragesMultipleClients() public {
        uint256 id = _registerAgent();
        vm.prank(client);
        reputation.giveFeedback(id, int128(60), 0, "", "", "", "", bytes32(0));
        vm.prank(client2);
        reputation.giveFeedback(id, int128(100), 0, "", "", "", "", bytes32(0));

        (uint64 count, int128 summaryValue,) = reputation.getSummary(id, new address[](0), "", "");
        assertEq(count, 2);
        assertEq(int256(summaryValue), int256(80e18), "avg of 60 and 100");
    }

    function test_Reputation_OwnerCannotRateOwnAgent() public {
        uint256 id = _registerAgent();
        vm.prank(owner);
        vm.expectRevert(ReputationRegistry.SelfFeedbackNotAllowed.selector);
        reputation.giveFeedback(id, int128(100), 0, "", "", "", "", bytes32(0));
    }

    function test_Reputation_ApprovedOperatorCannotRate() public {
        uint256 id = _registerAgent();
        // Owner approves an operator for all tokens; that operator must still be blocked.
        vm.prank(owner);
        identity.setApprovalForAll(stranger, true);
        vm.prank(stranger);
        vm.expectRevert(ReputationRegistry.SelfFeedbackNotAllowed.selector);
        reputation.giveFeedback(id, int128(100), 0, "", "", "", "", bytes32(0));
    }

    function test_Reputation_RevertsOnInvalidDecimals() public {
        uint256 id = _registerAgent();
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(ReputationRegistry.InvalidValueDecimals.selector, uint8(19)));
        reputation.giveFeedback(id, int128(1), 19, "", "", "", "", bytes32(0));
    }

    function test_Reputation_RevokeExcludesFromSummary() public {
        uint256 id = _registerAgent();
        vm.prank(client);
        reputation.giveFeedback(id, int128(80), 0, "", "", "", "", bytes32(0));
        vm.prank(client);
        reputation.revokeFeedback(id, 0);

        (uint64 count,,) = reputation.getSummary(id, new address[](0), "", "");
        assertEq(count, 0, "revoked feedback excluded");
    }

    function test_Reputation_RevokeOutOfRangeReverts() public {
        uint256 id = _registerAgent();
        vm.prank(client);
        vm.expectRevert(ReputationRegistry.FeedbackIndexOutOfRange.selector);
        reputation.revokeFeedback(id, 5);
    }

    function test_Reputation_TagFilter() public {
        uint256 id = _registerAgent();
        vm.prank(client);
        reputation.giveFeedback(id, int128(90), 0, "speed", "", "", "", bytes32(0));
        vm.prank(client2);
        reputation.giveFeedback(id, int128(10), 0, "other", "", "", "", bytes32(0));

        (uint64 count, int128 val,) = reputation.getSummary(id, new address[](0), "speed", "");
        assertEq(count, 1, "only the 'speed' entry matches");
        assertEq(int256(val), int256(90e18));
    }

    // ====================================================================== //
    //                          ValidationRegistry                            //
    // ====================================================================== //

    function test_Validation_RequestRespondFlow() public {
        uint256 id = _registerAgent();
        bytes32 h = keccak256("epoch1");

        vm.prank(owner);
        validation.validationRequest(vault, id, "ipfs://req", h);

        vm.prank(vault);
        validation.validationResponse(h, 75, "ipfs://res", keccak256("res"), "realizedPnL");

        (address validator, uint256 agentId, uint8 response,,,) = validation.getValidationStatus(h);
        assertEq(validator, vault);
        assertEq(agentId, id);
        assertEq(response, 75);

        address[] memory vs = new address[](1);
        vs[0] = vault;
        (uint64 count, uint8 avg) = validation.getSummary(id, vs, "");
        assertEq(count, 1);
        assertEq(avg, 75);
    }

    function test_Validation_Request_OnlyOwnerOrOperator() public {
        uint256 id = _registerAgent();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ValidationRegistry.NotAgentController.selector, id, stranger));
        validation.validationRequest(vault, id, "u", keccak256("x"));
    }

    function test_Validation_Request_ZeroValidatorReverts() public {
        uint256 id = _registerAgent();
        vm.prank(owner);
        vm.expectRevert(ValidationRegistry.ZeroValidator.selector);
        validation.validationRequest(address(0), id, "u", keccak256("x"));
    }

    function test_Validation_Request_DuplicateHashReverts() public {
        uint256 id = _registerAgent();
        bytes32 h = keccak256("dup");
        vm.startPrank(owner);
        validation.validationRequest(vault, id, "u", h);
        vm.expectRevert(abi.encodeWithSelector(ValidationRegistry.RequestAlreadyExists.selector, h));
        validation.validationRequest(vault, id, "u", h);
        vm.stopPrank();
    }

    function test_Validation_Response_OnlyDesignatedValidator() public {
        uint256 id = _registerAgent();
        bytes32 h = keccak256("epoch");
        vm.prank(owner);
        validation.validationRequest(vault, id, "u", h);

        vm.prank(stranger); // not the named validator
        vm.expectRevert(abi.encodeWithSelector(ValidationRegistry.NotDesignatedValidator.selector, h, stranger));
        validation.validationResponse(h, 90, "u", bytes32(0), "");
    }

    function test_Validation_Response_UnknownRequestReverts() public {
        bytes32 h = keccak256("missing");
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(ValidationRegistry.UnknownRequest.selector, h));
        validation.validationResponse(h, 50, "u", bytes32(0), "");
    }

    function test_Validation_Response_OutOfRangeReverts() public {
        uint256 id = _registerAgent();
        bytes32 h = keccak256("epoch");
        vm.prank(owner);
        validation.validationRequest(vault, id, "u", h);
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(ValidationRegistry.ResponseOutOfRange.selector, uint8(101)));
        validation.validationResponse(h, 101, "u", bytes32(0), "");
    }

    /// @notice THE trust-filter test: a malicious owner self-validates with a fake 100, but a
    ///         summary filtered to the real validator excludes it. This is why the
    ///         AllocationController/leaderboard must always filter to official vaults.
    function test_Validation_Summary_FiltersOutRogueSelfValidation() public {
        uint256 id = _registerAgent();

        // Honest validation from the real vault: score 80.
        bytes32 hReal = keccak256("real");
        vm.prank(owner);
        validation.validationRequest(vault, id, "u", hReal);
        vm.prank(vault);
        validation.validationResponse(hReal, 80, "u", bytes32(0), "");

        // Rogue: owner names THEMSELVES validator and posts a fake 100.
        bytes32 hFake = keccak256("fake");
        vm.prank(owner);
        validation.validationRequest(owner, id, "u", hFake);
        vm.prank(owner);
        validation.validationResponse(hFake, 100, "u", bytes32(0), "");

        // Filtered to the real vault → only the honest 80 counts.
        address[] memory real = new address[](1);
        real[0] = vault;
        (uint64 cReal, uint8 aReal) = validation.getSummary(id, real, "");
        assertEq(cReal, 1);
        assertEq(aReal, 80, "rogue self-validation excluded by the filter");

        // Unfiltered → both count (this is exactly why consumers must filter).
        (uint64 cAll, uint8 aAll) = validation.getSummary(id, new address[](0), "");
        assertEq(cAll, 2);
        assertEq(aAll, 90, "unfiltered average is polluted by the fake");
    }

    function test_Validation_Summary_UpdatesOnMultipleResponses() public {
        uint256 id = _registerAgent();
        bytes32 h = keccak256("epoch");
        vm.prank(owner);
        validation.validationRequest(vault, id, "u", h);

        // Same request can be re-answered (e.g. corrected); latest response is what counts.
        vm.startPrank(vault);
        validation.validationResponse(h, 40, "u", bytes32(0), "");
        validation.validationResponse(h, 95, "u", bytes32(0), "");
        vm.stopPrank();

        address[] memory vs = new address[](1);
        vs[0] = vault;
        (uint64 count, uint8 avg) = validation.getSummary(id, vs, "");
        assertEq(count, 1);
        assertEq(avg, 95, "latest response wins");
    }
}
