// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {Market} from "../src/Market.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {AgentRunner} from "../src/AgentRunner.sol";
import {AllocationController} from "../src/AllocationController.sol";
import {StrategyVault} from "../src/StrategyVault.sol";

/// @notice Deploys the full Mettle stack to Mantle Sepolia and seeds five demo agents with one
///         clean scoring round each, so the leaderboard is populated the moment it's live.
/// @dev Run with the deployer keystore:
///        forge script script/Deploy.s.sol:Deploy --rpc-url mantle_sepolia --account deployer --broadcast
///      Forge writes every deployed address to broadcast/Deploy.s.sol/5003/run-latest.json.
contract Deploy is Script {
    uint256 constant USD = 1e6; // base asset, 6 decimals
    uint256 constant UNIT = 1e18; // tradable tokens, 18 decimals
    uint256 constant FUND = 1_000 * USD; // capital traded per demo agent
    uint256 constant DEX_USD_LIQ = 1_000_000 * USD;
    uint256 constant DEX_TOKEN_LIQ = 100_000 * UNIT;

    function run() external {
        vm.startBroadcast();
        // The address actually broadcasting (your keystore account), not the script's default
        // msg.sender — this is who must hold the seed USDG to fund the agents.
        (, address deployer,) = vm.readCallers();

        // Base asset and the Mantle-themed tradables. These are mintable demo mocks for the
        // testnet; on mainnet they map to the real mETH, fBTC, MNT, USDY and MI4.
        MockERC20 usd = new MockERC20("Mettle USD", "mUSD", 6);
        MockERC20 meth = new MockERC20("Mantle Staked Ether", "mETH", 18);
        MockERC20 fbtc = new MockERC20("Ignition FBTC", "fBTC", 18);
        MockERC20 mnt = new MockERC20("Mantle", "MNT", 18);
        MockERC20 usdy = new MockERC20("Ondo US Dollar Yield", "USDY", 18);
        MockERC20 mi4 = new MockERC20("Mantle Index Four", "MI4", 18);

        address[] memory tradables = new address[](5);
        tradables[0] = address(meth);
        tradables[1] = address(fbtc);
        tradables[2] = address(mnt);
        tradables[3] = address(usdy);
        tradables[4] = address(mi4);

        // Core system.
        Market dex = new Market(address(usd));
        IdentityRegistry identity = new IdentityRegistry();
        ReputationRegistry reputation = new ReputationRegistry(address(identity));
        ValidationRegistry validation = new ValidationRegistry(address(identity));
        VaultFactory factory =
            new VaultFactory(address(usd), address(identity), address(validation), address(dex), tradables);
        AgentRunner runner = new AgentRunner(address(dex), address(usd));
        AllocationController controller =
            new AllocationController(address(usd), address(factory), address(validation), 50, 1);

        // Seed the swap venue with liquidity, then hand pricing to the runner so it can drive a
        // full trading round in one transaction.
        usd.mint(address(dex), DEX_USD_LIQ);
        for (uint256 i = 0; i < tradables.length; i++) {
            MockERC20(tradables[i]).mint(address(dex), DEX_TOKEN_LIQ);
        }
        dex.transferOwnership(address(runner));

        // USD to fund the five agents (one round each).
        usd.mint(deployer, 5 * FUND);

        address[5] memory vaults;
        vaults[0] = _seed(factory, runner, usd, address(meth), "ipfs://momentum-alpha", 1500, 5000);
        vaults[1] = _seed(factory, runner, usd, address(fbtc), "ipfs://breakout-hunter", 1000, 3000);
        vaults[2] = _seed(factory, runner, usd, address(mnt), "ipfs://volatility-harvester", 600, 2000);
        vaults[3] = _seed(factory, runner, usd, address(usdy), "ipfs://steady-yield", 400, 1000);
        vaults[4] = _seed(factory, runner, usd, address(mi4), "ipfs://mean-reversion", -800, -1000);

        vm.stopBroadcast();

        console.log("== Mettle deployed on Mantle Sepolia ==");
        console.log("USD (mUSD):          ", address(usd));
        console.log("mETH:                ", address(meth));
        console.log("fBTC:                ", address(fbtc));
        console.log("MNT:                 ", address(mnt));
        console.log("USDY:                ", address(usdy));
        console.log("MI4:                 ", address(mi4));
        console.log("Market:              ", address(dex));
        console.log("IdentityRegistry:    ", address(identity));
        console.log("ReputationRegistry:  ", address(reputation));
        console.log("ValidationRegistry:  ", address(validation));
        console.log("VaultFactory:        ", address(factory));
        console.log("AgentRunner:         ", address(runner));
        console.log("AllocationController:", address(controller));
        console.log("Vault momentum:      ", vaults[0]);
        console.log("Vault breakout:      ", vaults[1]);
        console.log("Vault volatility:    ", vaults[2]);
        console.log("Vault steady:        ", vaults[3]);
        console.log("Vault meanrev:       ", vaults[4]);
    }

    /// @dev Launch an agent with the runner as its trader, configure it, fund it, and run one
    ///      deterministic round so it lands on the leaderboard with a clean track record.
    function _seed(
        VaultFactory factory,
        AgentRunner runner,
        MockERC20 usd,
        address token,
        string memory uri,
        int256 bias,
        int256 move
    ) internal returns (address vault) {
        (, vault) = factory.launchAgent(uri, address(runner));
        runner.configureAgent(vault, token, bias);
        usd.approve(vault, FUND);
        StrategyVault(vault).deposit(FUND);
        runner.runEpochManual(vault, move);
    }
}
