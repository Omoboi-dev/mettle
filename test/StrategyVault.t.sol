// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {StrategyVault} from "../src/StrategyVault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {Market} from "../src/Market.sol";

/// @notice Proves the StrategyVault audit claims: non-custodial, donation-immune scoring,
///         and griefing-resistant liveness. Each "attack" test asserts the score / liveness
///         does not budge.
contract StrategyVaultTest is Test {
    IdentityRegistry identity;
    ValidationRegistry validation;
    Market dex;
    MockERC20 usd;
    MockERC20 meth;
    MockERC20 fbtc;
    StrategyVault vault;

    address owner = makeAddr("owner"); // agent NFT owner
    address trader = makeAddr("trader"); // the agent's trading key
    address alice = makeAddr("alice"); // capital provider
    address attacker = makeAddr("attacker");

    uint256 agentId;

    uint256 constant USD = 1e6; // 1 USD (6 decimals)
    uint256 constant UNIT = 1e18; // 1 whole tradable token (18 decimals)

    function setUp() public {
        usd = new MockERC20("Mettle USD", "mUSD", 6);
        meth = new MockERC20("Mantle Staked Ether", "mETH", 18);
        fbtc = new MockERC20("Ignition FBTC", "fBTC", 18);

        identity = new IdentityRegistry();
        validation = new ValidationRegistry(address(identity));
        dex = new Market(address(usd));

        // Demo prices: mETH $100, fBTC $200 (USD has 6 decimals).
        dex.setPrice(address(meth), 100 * USD);
        dex.setPrice(address(fbtc), 200 * USD);

        // Fund the DEX with deep liquidity for payouts.
        usd.mint(address(dex), 10_000_000 * USD);
        meth.mint(address(dex), 1_000_000 * UNIT);
        fbtc.mint(address(dex), 1_000_000 * UNIT);

        // Register the agent (owner holds the NFT).
        vm.prank(owner);
        agentId = identity.register("ipfs://agent");

        address[] memory tradables = new address[](2);
        tradables[0] = address(meth);
        tradables[1] = address(fbtc);
        vault = new StrategyVault(
            address(usd), address(identity), address(validation), address(dex), agentId, trader, tradables
        );

        // Wire the vault as the agent's operator so it can open & answer its validation.
        vm.prank(owner);
        identity.setAgentWallet(agentId, address(vault));

        // Alice funds the vault with 1,000 USD.
        usd.mint(alice, 1_000 * USD);
        vm.startPrank(alice);
        usd.approve(address(vault), type(uint256).max);
        vault.deposit(1_000 * USD);
        vm.stopPrank();
    }

    // ----------------------------- Happy path ----------------------------- //

    function test_HappyPath_ProfitScoresHigh() public {
        vm.prank(trader);
        vault.startEpoch("ipfs://epoch1");

        // Buy 1,000 USD worth of mETH (-> 10 mETH at $100).
        vm.prank(trader);
        vault.trade(address(usd), address(meth), 1_000 * USD, 0);
        assertEq(vault.accountedHoldings(address(meth)), 10 * UNIT, "bought 10 mETH");

        // mETH rises to $150 (+50%).
        dex.setPrice(address(meth), 150 * USD);

        // Sell all mETH back to USD.
        uint256 held = vault.accountedHoldings(address(meth));
        vm.prank(trader);
        vault.trade(address(meth), address(usd), held, 0);

        (int256 pnl, uint8 score) = _settle();
        assertEq(pnl, int256(500 * USD), "+500 USD realized");
        assertEq(score, 100, "score maxes at +50%");

        // The score is queryable from the ERC-8004 ValidationRegistry, filtered to this vault.
        address[] memory vaults = new address[](1);
        vaults[0] = address(vault);
        (uint64 count, uint8 avg) = validation.getSummary(agentId, vaults, "");
        assertEq(count, 1);
        assertEq(avg, 100);
    }

    function test_Loss_ScoresLow_AndVaultStaysUsable() public {
        vm.prank(trader);
        vault.startEpoch("e");
        vm.prank(trader);
        vault.trade(address(usd), address(meth), 1_000 * USD, 0);

        // Crash mETH to $40 (-60%).
        dex.setPrice(address(meth), 40 * USD);
        uint256 held = vault.accountedHoldings(address(meth));
        vm.prank(trader);
        vault.trade(address(meth), address(usd), held, 0);

        (int256 pnl, uint8 score) = _settle();
        assertEq(pnl, -int256(600 * USD), "-600 USD realized");
        assertEq(score, 0, "score floors on a big loss");

        // The vault must remain depositable after a loss (no div-by-zero / brick).
        usd.mint(alice, 100 * USD);
        vm.prank(alice);
        vault.deposit(100 * USD);
    }

    // --------------------------- Attack: donations ------------------------ //

    function test_Attack_DonateUSD_DoesNotInflateScore() public {
        vm.prank(trader);
        vault.startEpoch("e");

        // Attacker dumps a huge USD donation straight into the vault.
        usd.mint(attacker, 1_000_000 * USD);
        vm.prank(attacker);
        usd.transfer(address(vault), 1_000_000 * USD);

        // The agent cannot deploy donated USD: only the accounted 1,000 is tradable.
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(StrategyVault.ExceedsTradableUSD.selector, 1_000 * USD + 1, 1_000 * USD));
        vault.trade(address(usd), address(meth), 1_000 * USD + 1, 0);

        // No trades happen → realized P&L is exactly 0 and the score is neutral 50,
        // despite a million-dollar donation sitting in the vault.
        (int256 pnl, uint8 score) = _settle();
        assertEq(pnl, 0, "donation is not realized P&L");
        assertEq(score, 50, "score unmoved by donation");
    }

    function test_Attack_DonateToken_CannotBeSold() public {
        vm.prank(trader);
        vault.startEpoch("e");

        // Attacker donates 100 mETH to the vault.
        meth.mint(attacker, 100 * UNIT);
        vm.prank(attacker);
        meth.transfer(address(vault), 100 * UNIT);

        // The agent owns 0 *accounted* mETH, so it cannot sell the donated holdings for profit.
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(StrategyVault.ExceedsAccountedHoldings.selector, address(meth), 1, 0));
        vault.trade(address(meth), address(usd), 1, 0);

        (int256 pnl, uint8 score) = _settle();
        assertEq(pnl, 0, "donated holdings cannot become realized P&L");
        assertEq(score, 50, "score unmoved by token donation");
    }

    function test_Attack_DustTokenDonation_DoesNotBrick() public {
        // Attacker pre-seeds a 1-wei mETH donation before any epoch.
        meth.mint(attacker, 1);
        vm.prank(attacker);
        meth.transfer(address(vault), 1);

        // _requireFlat uses the accounted ledger, not balanceOf, so startEpoch still works.
        vm.prank(trader);
        vault.startEpoch("e");

        // ...and a full round trip + settle still works despite the lingering dust.
        vm.prank(trader);
        vault.trade(address(usd), address(meth), 1_000 * USD, 0);
        uint256 held = vault.accountedHoldings(address(meth));
        vm.prank(trader);
        vault.trade(address(meth), address(usd), held, 0);

        (, uint8 score) = _settle();
        assertEq(score, 50, "round-trip at flat price scores neutral; settle not bricked");
    }

    function test_Attack_FirstDepositorShareInflation_Fails() public {
        // Fresh vault with no deposits yet (setUp's vault already has Alice's deposit).
        address[] memory tradables = new address[](1);
        tradables[0] = address(meth);
        StrategyVault v = new StrategyVault(
            address(usd), address(identity), address(validation), address(dex), agentId, trader, tradables
        );

        // Attacker is the FIRST depositor with a single unit, then donates a huge amount
        // directly to try to inflate the share price (classic ERC-4626 inflation attack).
        usd.mint(attacker, 1);
        vm.startPrank(attacker);
        usd.approve(address(v), type(uint256).max);
        uint256 attackerShares = v.deposit(1);
        vm.stopPrank();
        assertEq(attackerShares, 1);

        usd.mint(attacker, 1_000_000 * USD);
        vm.prank(attacker);
        usd.transfer(address(v), 1_000_000 * USD); // donation

        // Honest depositor still gets FAIR shares (priced off internal accounting, not balance).
        usd.mint(alice, 1_000 * USD);
        vm.startPrank(alice);
        usd.approve(address(v), type(uint256).max);
        uint256 aliceShares = v.deposit(1_000 * USD);
        vm.stopPrank();
        assertEq(aliceShares, 1_000 * USD, "alice not diluted by the donation");

        // Alice recovers her full principal; attacker cannot skim the donation via 1 share.
        vm.prank(alice);
        assertEq(v.withdraw(aliceShares), 1_000 * USD, "alice recovers full principal");
        vm.prank(attacker);
        assertEq(v.withdraw(attackerShares), 1, "attacker's 1 share is worth 1, not the donation");
    }

    // ----------------------- Access control / custody --------------------- //

    function test_NonCustodial_TraderHasNoSharesAndCannotWithdraw() public {
        assertEq(vault.shares(trader), 0);
        vm.prank(trader);
        vm.expectRevert(StrategyVault.NothingToWithdraw.selector);
        vault.withdraw(1);
    }

    function test_OnlyTraderCanTrade() public {
        vm.prank(trader);
        vault.startEpoch("e");
        vm.prank(alice);
        vm.expectRevert(StrategyVault.NotTrader.selector);
        vault.trade(address(usd), address(meth), 1 * USD, 0);
    }

    function test_DepositsFrozenDuringEpoch() public {
        vm.prank(trader);
        vault.startEpoch("e");
        usd.mint(alice, 10 * USD);
        vm.prank(alice);
        vm.expectRevert(StrategyVault.DepositsFrozen.selector);
        vault.deposit(10 * USD);
    }

    function test_Constructor_RejectsUsdAsTradable() public {
        address[] memory bad = new address[](1);
        bad[0] = address(usd);
        vm.expectRevert(abi.encodeWithSelector(StrategyVault.InvalidTradableToken.selector, address(usd)));
        new StrategyVault(address(usd), address(identity), address(validation), address(dex), agentId, trader, bad);
    }

    function test_AliceCanWithdrawAfterProfit() public {
        // Run a +50% epoch, then Alice withdraws everything and should get ~1,500 USD.
        test_HappyPath_ProfitScoresHigh();
        uint256 sharesAlice = vault.shares(alice);
        vm.prank(alice);
        uint256 out = vault.withdraw(sharesAlice);
        assertEq(out, 1_500 * USD, "alice realizes the agent's gains");
    }

    // -------------------------------- helper ------------------------------ //

    function _settle() internal returns (int256 pnl, uint8 score) {
        vm.prank(trader);
        (pnl, score) = vault.settleEpoch("ipfs://result", keccak256("result"));
    }
}
