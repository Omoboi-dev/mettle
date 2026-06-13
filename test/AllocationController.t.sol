// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {StrategyVault} from "../src/StrategyVault.sol";
import {AllocationController} from "../src/AllocationController.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {Market} from "../src/Market.sol";

/// @notice Proves the AllocationController routes pooled capital to PROVEN agents only:
///         official-vault filter, track-record + score gates, score-weighted sizing, and that
///         realized agent profit flows back to index depositors.
contract AllocationControllerTest is Test {
    IdentityRegistry identity;
    ValidationRegistry validation;
    Market dex;
    MockERC20 usd;
    MockERC20 meth;
    MockERC20 fbtc;
    VaultFactory factory;
    AllocationController ctrl;

    StrategyVault vHigh; // score 100
    StrategyVault vLow; // score 60
    StrategyVault vNo; // launched but no track record (ineligible)

    address trader = makeAddr("trader");
    address user = makeAddr("user");

    uint256 constant USD = 1e6;
    uint256 constant UNIT = 1e18;

    function setUp() public {
        usd = new MockERC20("Mettle USD", "mUSD", 6);
        meth = new MockERC20("Mantle Staked Ether", "mETH", 18);
        fbtc = new MockERC20("Ignition FBTC", "fBTC", 18);

        identity = new IdentityRegistry();
        validation = new ValidationRegistry(address(identity));
        dex = new Market(address(usd));
        dex.setPrice(address(meth), 100 * USD);
        usd.mint(address(dex), 100_000_000 * USD);
        meth.mint(address(dex), 10_000_000 * UNIT);

        address[] memory tradables = new address[](2);
        tradables[0] = address(meth);
        tradables[1] = address(fbtc);
        factory = new VaultFactory(address(usd), address(identity), address(validation), address(dex), tradables);

        // This test contract launches (and thus owns) the agents.
        (, address a) = factory.launchAgent("high", trader);
        (, address b) = factory.launchAgent("low", trader);
        (, address c) = factory.launchAgent("norecord", trader);
        vHigh = StrategyVault(a);
        vLow = StrategyVault(b);
        vNo = StrategyVault(c);

        // Build track records: high agent +50% (score 100), low agent +10% (score 60).
        _scoreEpoch(vHigh, 1_000 * USD, 150 * USD);
        _scoreEpoch(vLow, 1_000 * USD, 110 * USD);

        // minScore 50 (breakeven), minEpochs 1 (must have settled at least one epoch).
        ctrl = new AllocationController(address(usd), address(factory), address(validation), 50, 1);
    }

    // ------------------------------ Core tests ---------------------------- //

    function test_Deposit_MintsSharesOneToOne() public {
        _userDeposit(3_000 * USD);
        assertEq(ctrl.shares(user), 3_000 * USD);
        assertEq(ctrl.totalNAV(), 3_000 * USD);
        assertEq(ctrl.idleUSD(), 3_000 * USD);
    }

    function test_Allocate_RoutesByScore_AndExcludesIneligible() public {
        _userDeposit(3_000 * USD);

        uint256 highBefore = vHigh.totalAssets();
        uint256 lowBefore = vLow.totalAssets();

        address[] memory cands = _sorted(address(vHigh), address(vLow), address(vNo));
        ctrl.allocate(cands, 2_000 * USD);

        // Weights 100 : 60 : 0 → high gets 1,250, low gets 750, norecord gets nothing.
        assertEq(vHigh.totalAssets() - highBefore, 1_250 * USD, "high weighted higher");
        assertEq(vLow.totalAssets() - lowBefore, 750 * USD, "low weighted lower");
        assertEq(ctrl.controllerShares(address(vNo)), 0, "no-track-record vault excluded");

        // Allocation conserves NAV (capital moved, not lost) and leaves the remainder idle.
        // NAV reads back within a few micro-USD of 3,000 due to vault share-mint flooring.
        assertEq(ctrl.idleUSD(), 1_000 * USD);
        assertApproxEqAbs(ctrl.totalNAV(), 3_000 * USD, 10);
    }

    function test_EligibleWeight_Gates() public {
        assertEq(ctrl.eligibleWeight(address(vHigh)), 100);
        assertEq(ctrl.eligibleWeight(address(vLow)), 60);
        assertEq(ctrl.eligibleWeight(address(vNo)), 0, "no track record -> weight 0");
        assertEq(ctrl.eligibleWeight(makeAddr("randomEOA")), 0, "non-official -> weight 0");
    }

    function test_Allocate_OnlyOwner() public {
        _userDeposit(1_000 * USD);
        address[] memory cands = _sorted(address(vHigh), address(vLow), address(vNo));
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        ctrl.allocate(cands, 500 * USD);
    }

    function test_Allocate_RequiresAscendingCandidates() public {
        _userDeposit(1_000 * USD);
        address[] memory cands = new address[](2);
        cands[0] = address(vHigh);
        cands[1] = address(vHigh); // duplicate / not strictly ascending
        vm.expectRevert(AllocationController.NotAscending.selector);
        ctrl.allocate(cands, 500 * USD);
    }

    function test_EndToEnd_AgentProfitFlowsToDepositor() public {
        _userDeposit(3_000 * USD);
        address[] memory cands = _sorted(address(vHigh), address(vLow), address(vNo));
        ctrl.allocate(cands, 2_000 * USD);
        assertApproxEqAbs(ctrl.totalNAV(), 3_000 * USD, 10);

        // The high agent runs another +50% epoch on its now-larger book (incl. pool capital).
        uint256 managed = vHigh.totalAssets();
        dex.setPrice(address(meth), 100 * USD);
        vm.prank(trader);
        vHigh.startEpoch("e2");
        vm.prank(trader);
        vHigh.trade(address(usd), address(meth), managed, 0);
        dex.setPrice(address(meth), 150 * USD);
        uint256 held = vHigh.accountedHoldings(address(meth));
        vm.prank(trader);
        vHigh.trade(address(meth), address(usd), held, 0);
        vm.prank(trader);
        vHigh.settleEpoch("r2", keccak256("r2"));

        // Pool NAV has risen from the agent's realized gains.
        assertGt(ctrl.totalNAV(), 3_000 * USD, "pool NAV grew with the agent");

        // Recall capital home (permissionless) and let the depositor withdraw the profit.
        address[] memory rec = new address[](2);
        (rec[0], rec[1]) =
            address(vHigh) < address(vLow) ? (address(vHigh), address(vLow)) : (address(vLow), address(vHigh));
        ctrl.recall(rec);

        uint256 sh = ctrl.shares(user);
        vm.prank(user);
        uint256 out = ctrl.withdraw(sh);
        assertGt(out, 3_300 * USD, "depositor realizes the agent's gains");
    }

    function test_Withdraw_NeedsIdle_RecallUnblocksIt() public {
        _userDeposit(2_000 * USD);
        address[] memory cands = _sorted(address(vHigh), address(vLow), address(vNo));
        ctrl.allocate(cands, 2_000 * USD); // all idle deployed

        // Nothing idle → a full withdraw can't be paid yet.
        uint256 sh = ctrl.shares(user);
        uint256 owed = ctrl.totalNAV(); // sole depositor → owed == NAV (~2,000), idle == 0
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(AllocationController.InsufficientIdle.selector, owed, 0));
        ctrl.withdraw(sh);

        // Recall brings funds home; now withdraw works.
        address[] memory rec = new address[](2);
        (rec[0], rec[1]) =
            address(vHigh) < address(vLow) ? (address(vHigh), address(vLow)) : (address(vLow), address(vHigh));
        ctrl.recall(rec);
        vm.prank(user);
        uint256 out = ctrl.withdraw(sh);
        assertApproxEqAbs(out, 2_000 * USD, 10, "recovers full principal (agents were flat this run)");
    }

    function test_Recall_PrunesDeployedVaults() public {
        _userDeposit(2_000 * USD);
        address[] memory cands = _sorted(address(vHigh), address(vLow), address(vNo));
        ctrl.allocate(cands, 2_000 * USD);
        assertEq(ctrl.deployedVaultCount(), 2, "two positions opened");

        address[] memory rec = new address[](2);
        (rec[0], rec[1]) =
            address(vHigh) < address(vLow) ? (address(vHigh), address(vLow)) : (address(vLow), address(vHigh));
        ctrl.recall(rec);
        assertEq(ctrl.deployedVaultCount(), 0, "array pruned after full recall");
    }

    function test_RenounceOwnership_Disabled() public {
        vm.expectRevert(AllocationController.RenounceDisabled.selector);
        ctrl.renounceOwnership();
    }

    // -------------------------------- helpers ----------------------------- //

    function _userDeposit(uint256 amount) internal {
        usd.mint(user, amount);
        vm.startPrank(user);
        usd.approve(address(ctrl), type(uint256).max);
        ctrl.deposit(amount);
        vm.stopPrank();
    }

    /// @dev Fund a vault and run one full epoch ending at `sellPrice` to set its score.
    function _scoreEpoch(StrategyVault v, uint256 fund, uint256 sellPrice) internal {
        usd.mint(address(this), fund);
        usd.approve(address(v), type(uint256).max);
        v.deposit(fund);

        dex.setPrice(address(meth), 100 * USD);
        vm.prank(trader);
        v.startEpoch("e");
        vm.prank(trader);
        v.trade(address(usd), address(meth), fund, 0);
        dex.setPrice(address(meth), sellPrice);
        uint256 held = v.accountedHoldings(address(meth));
        vm.prank(trader);
        v.trade(address(meth), address(usd), held, 0);
        vm.prank(trader);
        v.settleEpoch("r", keccak256("r"));
    }

    function _sorted(address a, address b, address c) internal pure returns (address[] memory arr) {
        arr = new address[](3);
        arr[0] = a;
        arr[1] = b;
        arr[2] = c;
        for (uint256 i = 0; i < 3; i++) {
            for (uint256 j = 0; j < 2; j++) {
                if (arr[j] > arr[j + 1]) {
                    address t = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = t;
                }
            }
        }
    }
}
