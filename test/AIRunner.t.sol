// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {StrategyVault} from "../src/StrategyVault.sol";
import {AIRunner} from "../src/AIRunner.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {Market} from "../src/Market.sol";

/// @notice Proves AIRunner executes an AI decision (asset + size) against a real market move,
///         lets the vault score it, and records the decision on-chain.
contract AIRunnerTest is Test {
    IdentityRegistry identity;
    ValidationRegistry validation;
    Market dex;
    MockERC20 usd;
    MockERC20 meth;
    MockERC20 fbtc;
    VaultFactory factory;
    AIRunner runner;
    StrategyVault vault;

    uint256 constant USD = 1e6;
    uint256 constant UNIT = 1e18;

    function setUp() public {
        usd = new MockERC20("Mettle USD", "mUSD", 6);
        meth = new MockERC20("Mantle Staked Ether", "mETH", 18);
        fbtc = new MockERC20("Ignition FBTC", "fBTC", 18);
        identity = new IdentityRegistry();
        validation = new ValidationRegistry(address(identity));
        dex = new Market(address(usd));
        usd.mint(address(dex), 100_000_000 * USD);
        meth.mint(address(dex), 10_000_000 * UNIT);
        fbtc.mint(address(dex), 10_000_000 * UNIT);

        address[] memory tradables = new address[](2);
        tradables[0] = address(meth);
        tradables[1] = address(fbtc);
        factory = new VaultFactory(address(usd), address(identity), address(validation), address(dex), tradables);

        runner = new AIRunner(address(dex), address(usd));
        dex.transferOwnership(address(runner)); // runner prices the venue
        (, address v) = factory.launchAgent("ipfs://ai-agent", address(runner));
        vault = StrategyVault(v);

        usd.mint(address(this), 1_000 * USD);
        usd.approve(v, type(uint256).max);
        vault.deposit(1_000 * USD);
    }

    function test_FullLong_RealUpMove_ScoresHigh() public {
        // AI goes full size into mETH; the real move is +50% -> score 100.
        uint8 score = runner.runEpochAI(address(vault), address(meth), 10_000, 5000, "ipfs://r1", keccak256("r1"));
        assertEq(score, 100, "full long into a +50% move maxes the score");
        assertApproxEqAbs(vault.totalAssets(), 1_500 * USD, 10);
    }

    function test_PartialSize_ScalesTheOutcome() public {
        // Half size into a +50% move -> +25% on the book -> score 75. This is the AI's risk lever.
        uint8 score = runner.runEpochAI(address(vault), address(meth), 5_000, 5000, "ipfs://r2", keccak256("r2"));
        assertEq(score, 75, "half size halves the gain");
        assertApproxEqAbs(vault.totalAssets(), 1_250 * USD, 10);
    }

    function test_StayInCash_ScoresNeutral() public {
        // AI chooses not to trade (size 0) -> no P&L -> neutral 50. A valid risk decision.
        uint8 score = runner.runEpochAI(address(vault), address(meth), 0, 5000, "ipfs://r3", keccak256("r3"));
        assertEq(score, 50, "cash is neutral");
        assertApproxEqAbs(vault.totalAssets(), 1_000 * USD, 10);
    }

    function test_WrongAsset_RealDownMove_ScoresLow() public {
        // AI picked an asset that fell 40% -> score 10.
        uint8 score = runner.runEpochAI(address(vault), address(fbtc), 10_000, -4000, "ipfs://r4", keccak256("r4"));
        assertEq(score, 10, "a bad pick into a -40% move scores low");
    }

    function test_DecisionIsRecordedOnChain() public {
        runner.runEpochAI(address(vault), address(meth), 8_000, 2000, "ipfs://why", keccak256("why"));
        (
            uint256 epoch,
            address asset,
            uint16 sizeBps,
            int256 moveBps,
            uint8 score,
            bytes32 rationaleHash,
            string memory rationaleURI,
        ) = runner.lastDecision(address(vault));
        assertEq(epoch, 1);
        assertEq(asset, address(meth));
        assertEq(sizeBps, 8_000);
        assertEq(moveBps, 2000);
        assertEq(score, 66, "0.8 * 20% = +16% -> score 66");
        assertEq(rationaleHash, keccak256("why"));
        assertEq(rationaleURI, "ipfs://why");
    }

    function test_OnlyOwnerCanRun() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(AIRunner.NotOwner.selector);
        runner.runEpochAI(address(vault), address(meth), 10_000, 1000, "u", bytes32(0));
    }

    function test_RejectsOversize() public {
        vm.expectRevert(abi.encodeWithSelector(AIRunner.SizeTooLarge.selector, uint16(10_001)));
        runner.runEpochAI(address(vault), address(meth), 10_001, 1000, "u", bytes32(0));
    }
}
