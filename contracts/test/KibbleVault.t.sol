// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KibbleVault} from "../src/KibbleVault.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";

contract KibbleVaultTest is Test {
    MockUSD8 token;
    KibbleVault vault;
    address owner = makeAddr("owner");
    address home = makeAddr("guardian");
    address stranger = makeAddr("stranger");

    function setUp() public {
        token = new MockUSD8();
        vault = new KibbleVault(token, owner, home, 1 days);
        token.mint(address(vault), 100e6);
    }

    function test_withdrawHome_isInstantAndOnlyToHome() public {
        vm.prank(owner);
        vault.withdrawHome(40e6);
        assertEq(token.balanceOf(home), 40e6);
        assertEq(vault.balance(), 60e6);
    }

    function test_onlyOwnerWithdraws() public {
        vm.prank(stranger);
        vm.expectRevert(KibbleVault.NotOwner.selector);
        vault.withdrawHome(1);
        vm.prank(home);
        vm.expectRevert(KibbleVault.NotOwner.selector);
        vault.queueWithdraw(home, 1);
    }

    function test_queuedWithdraw_waitsForDelay() public {
        vm.prank(owner);
        uint256 id = vault.queueWithdraw(stranger, 10e6);
        vm.prank(owner);
        vm.expectRevert(KibbleVault.NotReady.selector);
        vault.executeWithdraw(id);

        vm.warp(block.timestamp + 1 days);
        vm.prank(owner);
        vault.executeWithdraw(id);
        assertEq(token.balanceOf(stranger), 10e6);

        vm.prank(owner);
        vm.expectRevert(KibbleVault.AlreadyDone.selector);
        vault.executeWithdraw(id);
    }

    function test_guardianCancelsQueuedWithdraw() public {
        vm.prank(owner);
        uint256 id = vault.queueWithdraw(stranger, 10e6);
        vm.prank(home);
        vault.cancelWithdraw(id);
        vm.warp(block.timestamp + 2 days);
        vm.prank(owner);
        vm.expectRevert(KibbleVault.AlreadyDone.selector);
        vault.executeWithdraw(id);
        assertEq(token.balanceOf(stranger), 0);
    }

    function test_strangerCannotCancel() public {
        vm.prank(owner);
        uint256 id = vault.queueWithdraw(stranger, 1);
        vm.prank(stranger);
        vm.expectRevert(KibbleVault.NotOwnerOrHome.selector);
        vault.cancelWithdraw(id);
    }
}
