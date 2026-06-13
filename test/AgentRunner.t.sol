// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {StrategyVault} from "../src/StrategyVault.sol";
import {AgentRunner} from "../src/AgentRunner.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {Market} from "../src/Market.sol";

/// @notice Proves AgentRunner executes a full epoch in ONE call: open -> buy -> move -> sell ->
///         settle, and the vault writes a realized-P&L score on-chain.
contract AgentRunnerTest is Test {
    IdentityRegistry identity;
    ValidationRegistry validation;
    Market dex;
    MockERC20 usd;
    MockERC20 meth;
    VaultFactory factory;
    AgentRunner runner;
    StrategyVault vault;

    uint256 constant USD = 1e6;
    uint256 constant UNIT = 1e18;

    function setUp() public {
        usd = new MockERC20("Mettle USD", "mUSD", 6);
        meth = new MockERC20("Mantle Staked Ether", "mETH", 18);
        identity = new IdentityRegistry();
        validation = new ValidationRegistry(address(identity));
        dex = new Market(address(usd));
        usd.mint(address(dex), 100_000_000 * USD);
        meth.mint(address(dex), 10_000_000 * UNIT);

        address[] memory tradables = new address[](1);
        tradables[0] = address(meth);
        factory = new VaultFactory(address(usd), address(identity), address(validation), address(dex), tradables);

        runner = new AgentRunner(address(dex), address(usd));
        // Runner must own the DEX (to set prices) and be the vault's trader.
        dex.transferOwnership(address(runner));
        (, address v) = factory.launchAgent("ipfs://momentum", address(runner));
        vault = StrategyVault(v);
        runner.configureAgent(v, address(meth), int256(1500)); // +15% bias

        // Fund the vault so it has capital to trade.
        usd.mint(address(this), 1_000 * USD);
        usd.approve(v, type(uint256).max);
        vault.deposit(1_000 * USD);
    }

    function test_RunEpochManual_ProducesScore_AndWritesValidation() public {
        // Deterministic +50% round -> score 100.
        uint8 score = runner.runEpochManual(address(vault), int256(5000));
        assertEq(score, 100, "score 100 for +50%");
        assertFalse(vault.epochActive(), "epoch settled");

        // Score is readable from the ValidationRegistry, filtered to the vault validator.
        address[] memory vs = new address[](1);
        vs[0] = address(vault);
        (uint64 count, uint8 avg) = validation.getSummary(vault.agentId(), vs, "");
        assertEq(count, 1);
        assertEq(avg, 100);

        // Vault grew by the realized gain (1,000 -> ~1,500 USD).
        assertApproxEqAbs(vault.totalAssets(), 1_500 * USD, 10);
    }

    function test_RunEpochManual_Loss_LowersScore() public {
        uint8 score = runner.runEpochManual(address(vault), int256(-1000)); // -10%
        assertEq(score, 40, "score 40 for -10%");
        assertApproxEqAbs(vault.totalAssets(), 900 * USD, 10);
    }

    function test_PublicRunEpoch_Works_AndBuildsTrackRecord() public {
        // Anyone can trigger a live round; result is pseudo-random around the +15% bias.
        runner.runEpoch(address(vault));
        runner.runEpoch(address(vault));
        address[] memory vs = new address[](1);
        vs[0] = address(vault);
        (uint64 count,) = validation.getSummary(vault.agentId(), vs, "");
        assertEq(count, 2, "two settled epochs recorded");
    }

    function test_ConfigureAgent_OnlyOwner() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(AgentRunner.NotOwner.selector);
        runner.configureAgent(address(vault), address(meth), 0);
    }

    function test_RunEpoch_RevertsForUnconfiguredVault() public {
        vm.expectRevert(abi.encodeWithSelector(AgentRunner.AgentNotConfigured.selector, address(0xCAFE)));
        runner.runEpoch(address(0xCAFE));
    }
}
