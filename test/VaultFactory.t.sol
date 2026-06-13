// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {StrategyVault} from "../src/StrategyVault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {Market} from "../src/Market.sol";

/// @notice Proves VaultFactory launches official, fully-wired vaults atomically, and that the
///         `isOfficialVault` registry is a sound trust anchor (fake vaults are not official).
contract VaultFactoryTest is Test {
    IdentityRegistry identity;
    ValidationRegistry validation;
    Market dex;
    MockERC20 usd;
    MockERC20 meth;
    MockERC20 fbtc;
    VaultFactory factory;

    address creator = makeAddr("creator"); // the person launching an agent
    address trader = makeAddr("trader");

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
        dex.setPrice(address(fbtc), 200 * USD);
        usd.mint(address(dex), 10_000_000 * USD);
        meth.mint(address(dex), 1_000_000 * UNIT);

        address[] memory tradables = new address[](2);
        tradables[0] = address(meth);
        tradables[1] = address(fbtc);
        factory = new VaultFactory(address(usd), address(identity), address(validation), address(dex), tradables);
    }

    function test_LaunchAgent_WiresEverythingAndTransfersNFT() public {
        vm.prank(creator);
        (uint256 agentId, address vaultAddr) = factory.launchAgent("ipfs://agent", trader);
        StrategyVault vault = StrategyVault(vaultAddr);

        // Caller owns the agent NFT (factory handed it over).
        assertEq(identity.ownerOf(agentId), creator, "creator owns the agent");
        // Vault is wired as the agent's operator wallet.
        assertEq(identity.getAgentWallet(agentId), vaultAddr, "vault is the agent operator");
        // Vault is recorded official and indexed.
        assertTrue(factory.isOfficialVault(vaultAddr), "vault is official");
        assertEq(factory.vaultOf(agentId), vaultAddr);
        assertEq(factory.vaultCount(), 1);
        // Vault knows its agent and trader.
        assertEq(vault.agentId(), agentId);
        assertEq(vault.trader(), trader);
    }

    function test_LaunchedVault_CanRunAFullScoringEpoch() public {
        vm.prank(creator);
        (uint256 agentId, address vaultAddr) = factory.launchAgent("ipfs://agent", trader);
        StrategyVault vault = StrategyVault(vaultAddr);

        // Fund and run a profitable epoch — proves the vault can self-score (operator wiring works).
        usd.mint(creator, 1_000 * USD);
        vm.startPrank(creator);
        usd.approve(vaultAddr, type(uint256).max);
        vault.deposit(1_000 * USD);
        vm.stopPrank();

        vm.prank(trader);
        vault.startEpoch("e");
        vm.prank(trader);
        vault.trade(address(usd), address(meth), 1_000 * USD, 0);
        dex.setPrice(address(meth), 150 * USD);
        uint256 held = vault.accountedHoldings(address(meth));
        vm.prank(trader);
        vault.trade(address(meth), address(usd), held, 0);
        vm.prank(trader);
        vault.settleEpoch("r", keccak256("r"));

        // Score is readable from the ERC-8004 registry, filtered to the OFFICIAL vault.
        address[] memory vaults = factory.officialVaults();
        (uint64 count, uint8 avg) = validation.getSummary(agentId, vaults, "");
        assertEq(count, 1);
        assertEq(avg, 100);
    }

    function test_TrustAnchor_FakeVaultIsNotOfficial() public {
        // Anyone can deploy their OWN StrategyVault outside the factory...
        vm.prank(creator);
        uint256 agentId = identity.register("ipfs://rogue");
        address[] memory tradables = new address[](1);
        tradables[0] = address(meth);
        StrategyVault rogue = new StrategyVault(
            address(usd), address(identity), address(validation), address(dex), agentId, trader, tradables
        );

        // ...but it is NOT official, so consumers (allocation/leaderboard) will ignore its scores.
        assertFalse(factory.isOfficialVault(address(rogue)), "rogue vault is not official");
    }

    function test_TwoLaunches_AreIndependentAndBothOfficial() public {
        vm.prank(creator);
        (uint256 id1, address v1) = factory.launchAgent("a1", trader);
        vm.prank(creator);
        (uint256 id2, address v2) = factory.launchAgent("a2", trader);

        assertTrue(id1 != id2 && v1 != v2);
        assertTrue(factory.isOfficialVault(v1) && factory.isOfficialVault(v2));
        assertEq(factory.vaultCount(), 2);
    }

    function test_Reverts_OnZeroTrader() public {
        vm.prank(creator);
        vm.expectRevert(VaultFactory.ZeroTrader.selector);
        factory.launchAgent("a", address(0));
    }

    function test_Constructor_RejectsUsdInTradableSet() public {
        address[] memory bad = new address[](1);
        bad[0] = address(usd);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.InvalidTradableToken.selector, address(usd)));
        new VaultFactory(address(usd), address(identity), address(validation), address(dex), bad);
    }
}
