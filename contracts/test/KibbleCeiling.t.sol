// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KibbleBase} from "./KibbleBase.sol";
import {KibbleCore} from "../src/KibbleCore.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {Mode, State, Config} from "../src/KibbleTypes.sol";

/// The refund loophole and its relatives: uncleared sales raise the cost ceiling, so an attacker with the
/// agent key and money of their own tries to raise it with sales that never turn into value.
contract KibbleCeilingTest is KibbleBase {
    uint256 constant FAKE = 10e6;

    function setUp() public override {
        super.setUp();
        token.mint(attacker, 1_000e6);
    }

    function attackerBuys(KibbleDrawer d, uint256 amount) internal returns (bytes32 b) {
        b = bill();
        vm.startPrank(attacker);
        token.approve(address(d), amount);
        d.buy(b, amount);
        vm.stopPrank();
    }

    function refundAsAgent(KibbleDrawer d, bytes32 b) internal returns (bool ok) {
        vm.prank(agent);
        (ok,) = address(d).call(abi.encodeCall(d.refund, (b)));
    }

    // ------------------------------------------------------------ the loophole

    /// Fake sale -> overspend at an approved supplier -> take the fake sale back.
    function test_attack_buyOverspendRefund_sameWindow() public {
        KibbleDrawer d = earned();
        uint256 before = token.balanceOf(attacker);
        bytes32 b = attackerBuys(d, FAKE);
        payS(d, 1e6);
        payS(d, 1e6);
        assertGt(d.windowSpend(), 1e6, "the fake sale did raise the ceiling");
        refundAsAgent(d, b);
        uint256 cost = before - token.balanceOf(attacker);
        assertGe(cost, d.lifetimeSpend(), "the attacker can't overspend with money they get back");
    }

    /// Same, but the fake sale outlives the window (the default hold is a day, as long as the window).
    function test_attack_buyOverspendRefund_nextWindow() public {
        Config memory c = cfg(0);
        c.incomeHold = 60; // three demo windows
        KibbleDrawer d = newDrawer(Mode.EARNED, c);
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
        uint256 before = token.balanceOf(attacker);
        bytes32 b = attackerBuys(d, FAKE);
        payS(d, 1e6);
        payS(d, 1e6);
        nextWindow(d);
        refundAsAgent(d, b);
        nextWindow(d);
        refundAsAgent(d, b);
        uint256 cost = before - token.balanceOf(attacker);
        assertGe(cost, d.lifetimeSpend(), "waiting for the next window doesn't help");
    }

    /// Splitting the fake sale into small ones doesn't help either.
    function test_attack_manySmallFakeSales() public {
        KibbleDrawer d = earned();
        uint256 before = token.balanceOf(attacker);
        bytes32[] memory bs = new bytes32[](20);
        for (uint256 i; i < 20; ++i) bs[i] = attackerBuys(d, 0.5e6);
        payS(d, 1e6);
        payS(d, 1e6);
        for (uint256 i; i < 20; ++i) refundAsAgent(d, bs[i]);
        uint256 cost = before - token.balanceOf(attacker);
        assertGe(cost, d.lifetimeSpend(), "can't refund past the spend they back");
    }

    /// One sale backs its spending once, not again in every window it stays uncleared.
    function test_attack_oneSaleSpentInManyWindows() public {
        Config memory c = cfg(0);
        c.incomeHold = 200; // ten demo windows
        c.slack = 0;
        KibbleDrawer d = newDrawer(Mode.EARNED, c);
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
        attackerBuys(d, 1e6); // backs at most costBps of 1 tUSD8, once
        uint256 most = (1e6 * d.costBps()) / 10_000;
        for (uint256 i; i < 6; ++i) {
            payS(d, 0.4e6);
            payS(d, 0.4e6);
            payS(d, 0.1e6);
            nextWindow(d);
        }
        assertLe(d.lifetimeSpend(), most, "one sale, one ceiling");
    }

    /// The fake sale can be left to clear, but then the money belongs to the owner.
    function test_attack_leavingTheFakeSale_paysTheOwner() public {
        KibbleDrawer d = earned();
        uint256 before = token.balanceOf(attacker);
        uint256 vaultBefore = token.balanceOf(address(vault));
        attackerBuys(d, FAKE);
        payS(d, 1e6);
        payS(d, 1e6);
        clearHold(d);
        assertEq(before - token.balanceOf(attacker), FAKE);
        assertGt(token.balanceOf(address(vault)) - vaultBefore, d.lifetimeSpend(), "the owner ends up ahead");
        assertBuckets(d);
    }

    /// The loss stays inside maxLossNow even for an attacker who burns their own money.
    function test_attack_neverAboveMaxLossNow() public {
        KibbleDrawer d = earned();
        uint256 bound = d.maxLossNow();
        attackerBuys(d, FAKE);
        for (uint256 i; i < 10; ++i) payS(d, 1e6);
        assertLe(d.lifetimeSpend(), bound);
    }

    // ------------------------------------------------------------ honest agents

    function test_refund_honest_unservedSale() public {
        KibbleDrawer d = earned();
        bytes32 first = sell(d, 1e6);
        assertTrue(payS(d, 0.4e6)); // input for the first sale
        bytes32 second = sell(d, 1e6); // can't be served: give the money back
        assertTrue(refundAsAgent(d, second));
        assertFalse(refundAsAgent(d, first), "the first sale already paid for an input");
        assertBuckets(d);
    }

    function test_refund_honest_coveredByClearedSales() public {
        KibbleDrawer d = earned();
        sell(d, 2e6);
        clearHold(d);
        bytes32 b = sell(d, 1e6);
        assertTrue(payS(d, 0.4e6));
        assertTrue(refundAsAgent(d, b), "cleared value covers the spend");
    }

    function test_refund_ownerAlwaysCan() public {
        KibbleDrawer d = earned();
        bytes32 b = attackerBuys(d, FAKE);
        payS(d, 1e6);
        assertFalse(refundAsAgent(d, b));
        vm.prank(owner);
        d.refund(b);
        assertEq(d.pendingTotal(), 0);
        assertEq(d.ceilingRoom(), 0);
        assertBuckets(d);
    }

    function test_refund_othersCant() public {
        KibbleDrawer d = earned();
        bytes32 b = sell(d, 1e6);
        vm.prank(attacker);
        vm.expectRevert(KibbleCore.NotAgent.selector);
        d.refund(b);
        vm.prank(guardian);
        vm.expectRevert(KibbleCore.NotAgent.selector);
        d.refund(b);
    }

    /// A seller whose sales take several windows to clear can still buy each sale's input, once per sale.
    function test_honest_slowClearing_keepsSelling() public {
        Config memory c = cfg(0);
        c.incomeHold = 50; // two and a half demo windows
        KibbleDrawer d = newDrawer(Mode.EARNED, c);
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
        for (uint256 w; w < 8; ++w) {
            for (uint256 i; i < 2; ++i) {
                sell(d, 0.3e6);
                assertTrue(payS(d, 0.12e6), "input refused");
            }
            nextWindow(d);
            assertBuckets(d);
        }
        assertEq(d.strikes(), 0);
    }

    /// Any mix of fake sale and refund: the attacker never spends more than they give up (plus the slack).
    function testFuzz_attack_neverProfitable(uint256 fake, uint256 spend, uint8 windows, uint256 hold) public {
        fake = bound(fake, 1, 50e6);
        hold = bound(hold, 1, 200);
        Config memory c = cfg(0);
        c.incomeHold = uint64(hold);
        KibbleDrawer d = newDrawer(Mode.EARNED, c);
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
        uint256 before = token.balanceOf(attacker);
        bytes32 b = attackerBuys(d, fake);
        spend = bound(spend, 1, 1e6);
        payS(d, spend);
        payS(d, spend);
        for (uint256 i; i < windows % 5; ++i) {
            refundAsAgent(d, b);
            nextWindow(d);
            payS(d, spend);
        }
        refundAsAgent(d, b);
        uint256 cost = before - token.balanceOf(attacker);
        // the slack (0.05 a window) is spendable with no sales at all, by design
        assertLe(d.lifetimeSpend(), cost + 0.05e6 * 5);
        assertBuckets(d);
    }
}
