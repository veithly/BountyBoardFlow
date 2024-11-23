// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/MockERC20.sol";

contract MintTokenScript is Script {
    function run() external {
        // 开始广播交易
        vm.startBroadcast();

        // 部署合约的地址（如果已经部署过，直接使用现有地址）
        address tokenAddress = 0xaEbAfCa968c845bD69206Ba3c61cFbf59D123A23;
        MockERC20 token = MockERC20(tokenAddress);

        // mint 代币给指定地址
        address recipient = 0x9DB42275a5F1752392b31D4E9Af2D7A318263887;
        uint256 amount = 1000000000000 * 10**18; // mint 1000 个代币
        token.mint(recipient, amount);

        vm.stopBroadcast();
    }
}