// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — simple mintable ERC-20 with configurable decimals (tests / testnet deploy)
/// @notice Stands in for the base USD asset and the tradable Mantle ecosystem assets (e.g. mETH,
///         fBTC) on Mantle Sepolia, where the real tokens have no liquid testnet market. On
///         mainnet these map to the genuine assets; here they are demo tokens priced by Market.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
