// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KibbleBase} from "./KibbleBase.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {KibbleCore} from "../src/KibbleCore.sol";
import {Mode, State, Reason, Param, ReceiptData, Init} from "../src/KibbleTypes.sol";

/// Core earned-mode behaviour: paying, refusals, income, sweep, ceiling, strikes, T, learning, ladder.
contract KibbleDrawerTest is KibbleBase {
    // ------------------------------------------------------------ setup and derivation

    function test_init_derivesEverythingFromMaxWeeklyLoss() public {
        KibbleDrawer d = newDrawer(Mode.EARNED, cfg(5));
        assertEq(d.tMax(), 10e6, "Tmax = L/2");
        assertEq(d.limitT(), 2e6, "Tstart = min(2, L/10)");
        assertEq(d.approvalThreshold(), 2e6, "approval = L/10");
        assertEq(d.unknownRemaining(), 1e6, "U = 1 tUSD8");
        assertEq(uint8(d.state()), uint8(State.Learning));
        assertEq(d.costBps(), 9_000, "loose ceiling while learning");
        assertEq(d.guardian(), guardian, "guardian is the vault's home");
    }

    function test_init_cannotBeCalledTwice() public {
        KibbleDrawer d = earned();
        vm.expectRevert();
        d.initialize(_emptyInit());
    }

    // ------------------------------------------------------------ paying

    function test_pay_approvedSupplier_writesReceipt() public {
        KibbleDrawer d = earned();
        bytes32 b = bill();
        vm.prank(agent);
        assertTrue(d.pay(supplier, 0.04e6, b));
        assertEq(token.balanceOf(supplier), 0.04e6);
        assertEq(d.allowance(), 2e6 - 0.04e6);
        assertTrue(d.usedFingerprint(d.fingerprint(supplier, 0.04e6, b)));
        ReceiptData memory r = d.receipt(1);
        assertEq(r.payee, supplier);
        assertEq(r.amount, 0.04e6);
        assertEq(r.billRef, b);
        assertEq(r.approvedBy, agent);
        assertEq(r.limitT, 2e6);
        assertBuckets(d);
    }

    function test_pay_onlyAgent() public {
        KibbleDrawer d = earned();
        vm.prank(attacker);
        vm.expectRevert(KibbleCore.NotAgent.selector);
        d.pay(supplier, 1, bill());
    }

    function test_pay_sameBillTwice_refused() public {
        KibbleDrawer d = earned();
        bytes32 b = bill();
        vm.startPrank(agent);
        assertTrue(d.pay(supplier, 0.04e6, b));
        vm.expectEmit(false, false, false, false, address(d));
        emit KibbleCore.Refused(bytes32(0), Reason.DuplicateBill, supplier, 0.04e6, b);
        assertFalse(d.pay(supplier, 0.04e6, b));
        vm.stopPrank();
        assertEq(token.balanceOf(supplier), 0.04e6, "paid once");
    }

    function test_pay_refusalDoesNotMarkFingerprint() public {
        KibbleDrawer d = earned();
        bytes32 b = bill();
        vm.prank(guardian);
        adm(d).freeze();
        vm.prank(agent);
        assertFalse(d.pay(supplier, 0.04e6, b));
        assertFalse(d.usedFingerprint(d.fingerprint(supplier, 0.04e6, b)));
    }

    function test_pay_stranger_capsAtOneTusd8Lifetime() public {
        KibbleDrawer d = earned();
        sell(d, 5e6); // ceiling room, so only U limits the stranger
        vm.startPrank(agent);
        assertTrue(d.pay(attacker, 0.6e6, bill()));
        assertFalse(d.pay(attacker, 0.5e6, bill()), "over U");
        assertTrue(d.pay(attacker, 0.4e6, bill()));
        assertFalse(d.pay(attacker, 1, bill()), "U used up");
        vm.stopPrank();
        assertEq(token.balanceOf(attacker), 1e6);
        assertEq(d.unknownRemaining(), 0);
        assertEq(d.strangerPaid(), 1e6);
    }

    function test_pay_supplierCaps() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).tightenSupplier(supplier, 0.5e6, 0.6e6);
        vm.startPrank(agent);
        assertFalse(d.pay(supplier, 0.51e6, bill()), "per payment");
        assertTrue(d.pay(supplier, 0.04e6, bill()));
        vm.stopPrank();
        // per window: 0.04 spent, allow up to 0.6; ceiling room is only slack so give value first
        sell(d, 5e6);
        vm.startPrank(agent);
        assertTrue(d.pay(supplier, 0.5e6, bill()));
        assertFalse(d.pay(supplier, 0.1e6, bill()), "per window");
        vm.stopPrank();
        nextWindow(d);
        vm.prank(agent);
        assertTrue(d.pay(supplier, 0.1e6, bill()), "window cap resets");
    }

    function test_pay_aboveApprovalThreshold_needsOwner() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).tighten(Param.ApprovalThreshold, 0.5e6);
        vm.prank(agent);
        assertFalse(d.pay(supplier, 0.6e6, bill()));
    }

    function test_pay_overAllowance_refused() public {
        KibbleDrawer d = earned();
        sell(d, 5e6); // ceiling room, but the allowance is still 2
        vm.prank(owner);
        adm(d).tightenSupplier(supplier, 1e6, 10e6);
        vm.startPrank(agent);
        assertTrue(d.pay(supplier, 1e6, bill()));
        assertTrue(d.pay(supplier, 0.9e6, bill()));
        assertFalse(d.pay(supplier, 0.2e6, bill()), "only 0.1 left");
        vm.stopPrank();
    }

    function test_pay_neverRevertsForPolicy() public {
        KibbleDrawer d = earned();
        vm.startPrank(agent);
        d.pay(address(0), 1, bill());
        d.pay(supplier, 0, bill());
        d.pay(supplier, 100e6, bill());
        d.pay(attacker, 100e6, bill());
        vm.stopPrank();
        vm.prank(owner);
        adm(d).revoke();
        vm.prank(agent);
        assertFalse(d.pay(supplier, 1, bill()));
    }

    // ------------------------------------------------------------ income, refill, sweep

    function test_income_pendingThenClearedThenRefillAndSweep() public {
        KibbleDrawer d = earned();
        sell(d, 1e6); // sell first: pending sales give the ceiling room
        assertTrue(payS(d, 0.4e6)); // allowance 1.6
        assertEq(d.pendingTotal(), 1e6);
        assertEq(d.windowValue(), 0, "pending is not value yet");
        assertBuckets(d);

        clearHold(d);
        assertEq(d.windowValue(), 1e6);
        assertEq(d.allowance(), 2e6, "refilled to T");
        assertEq(token.balanceOf(address(vault)), 0.6e6, "rest swept");
        assertBuckets(d);
    }

    function test_income_buyerAckClearsAtOnce() public {
        KibbleDrawer d = earned();
        bytes32 b = sell(d, 1e6);
        vm.prank(buyer);
        d.ackDelivery(b);
        assertEq(d.windowValue(), 1e6);
        assertEq(d.pendingTotal(), 0);
    }

    function test_income_onlyPayerCanAck() public {
        KibbleDrawer d = earned();
        bytes32 b = sell(d, 1e6);
        vm.prank(agent);
        vm.expectRevert(KibbleCore.NotPayer.selector);
        d.ackDelivery(b);
    }

    function test_refund_fromPendingIncome_doesNotUseU() public {
        KibbleDrawer d = earned();
        bytes32 b = sell(d, 1e6);
        uint256 before = token.balanceOf(buyer);
        vm.prank(agent);
        d.refund(b);
        assertEq(token.balanceOf(buyer), before + 1e6);
        assertEq(d.unknownRemaining(), 1e6, "U untouched");
        assertEq(d.pendingTotal(), 0);
        clearHold(d);
        assertEq(d.windowValue(), 0, "refunded sale never counts");
        assertBuckets(d);
    }

    function test_refund_afterClear_notAllowed() public {
        KibbleDrawer d = earned();
        bytes32 b = sell(d, 1e6);
        clearHold(d);
        vm.prank(agent);
        vm.expectRevert(KibbleCore.NotPending.selector);
        d.refund(b);
    }

    function test_income_plainTransferCountsAfterHold() public {
        KibbleDrawer d = earned();
        token.mint(address(d), 1e6);
        d.sync();
        assertEq(d.pendingTotal(), 1e6);
        clearHold(d);
        assertEq(d.windowValue(), 1e6);
        assertBuckets(d);
    }

    function test_income_clearingCappedPerBlock_excessToVault() public {
        KibbleDrawer d = earned();
        sell(d, 7e6);
        clearHold(d);
        assertEq(d.windowValue(), 2e6, "cap = max(T, last window value) = 2");
        assertEq(d.allowance(), 2e6);
        // 2 of value (allowance already full, so swept) + 5 of excess that never counted
        assertEq(token.balanceOf(address(vault)), 7e6);
        assertBuckets(d);
    }

    function test_buy_duplicateBillRefRejected() public {
        KibbleDrawer d = earned();
        bytes32 b = sell(d, 1e6);
        vm.prank(buyer);
        vm.expectRevert(KibbleCore.BadBillRef.selector);
        d.buy(b, 1e6);
    }

    // ------------------------------------------------------------ cost ceiling and strikes

    function test_ceiling_refusesAndStrikesWalkTheLadder() public {
        KibbleDrawer d = earned();
        // no value this window: ceiling = slack (0.05)
        assertTrue(payS(d, 0.04e6));
        assertFalse(payS(d, 0.6e6), "over ceiling");
        assertEq(d.strikes(), 1);
        assertEq(uint8(d.state()), uint8(State.Watch));

        assertFalse(payS(d, 0.6e6), "inside cooldown: refused, no new strike");
        assertEq(d.strikes(), 1);

        skip(5);
        assertFalse(payS(d, 0.6e6));
        assertEq(uint8(d.state()), uint8(State.Braked));
        skip(5);
        assertFalse(payS(d, 0.6e6));
        assertEq(uint8(d.state()), uint8(State.Paused), "3 strikes: paused with no human");
        assertEq(d.maxLossNow(), 0);
    }

    function test_ceiling_noStrikeBelowMinActivity() public {
        KibbleDrawer d = earned();
        assertFalse(payS(d, 0.1e6)); // over slack, but tiny
        assertEq(d.strikes(), 0);
    }

    function test_ceiling_pendingSalesCountForCeiling() public {
        KibbleDrawer d = earned();
        sell(d, 0.1e6);
        assertTrue(payS(d, 0.04e6), "seller buys its input before the hold clears");
    }

    // ------------------------------------------------------------ earned limit T

    function test_T_growsOnProfit_cappedByStep() public {
        KibbleDrawer d = earned();
        sell(d, 1e6);
        payS(d, 0.4e6);
        clearHold(d);
        nextWindow(d);
        // profit 0.6, growth 10% = 0.06
        assertEq(d.limitT(), 2.06e6);
    }

    function test_T_shrinksOnLoss_andLossMovesToWatch() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).tighten(Param.Slack, 0); // isolate T maths
        sell(d, 1e6);
        clearHold(d);
        // allowance 2, value 1: spend 0.9 is under the 90% ceiling
        payS(d, 0.9e6);
        nextWindow(d); // profit +0.1: T 2.01
        assertEq(d.limitT(), 2.01e6);
        // a loss window: value 0.5 (prev carry helps the ceiling), spend 0.9
        sell(d, 0.5e6);
        clearHold(d);
        payS(d, 0.9e6);
        nextWindow(d);
        assertEq(d.limitT(), 1.61e6, "T shrinks by the 0.4 loss");
        assertEq(uint8(d.state()), uint8(State.Watch));
        assertLe(d.allowance(), d.limitT());
    }

    function test_T_neverAboveTmax() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).tighten(Param.TMax, 2.05e6);
        sell(d, 1e6);
        clearHold(d);
        nextWindow(d);
        assertEq(d.limitT(), 2.05e6);
    }

    function test_watch_twoCleanWindowsBackToHealthy() public {
        KibbleDrawer d = earned();
        assertFalse(payS(d, 0.6e6)); // strike: Watch
        assertEq(uint8(d.state()), uint8(State.Watch));
        for (uint256 i; i < 2; ++i) {
            nextWindow(d);
            sell(d, 1e6);
            clearHold(d);
        }
        nextWindow(d);
        assertEq(uint8(d.state()), uint8(State.Healthy));
        assertEq(d.strikes(), 0);
    }

    function test_watch_refillsOnlyToHalfT() public {
        KibbleDrawer d = earned();
        payS(d, 0.04e6);
        assertFalse(payS(d, 0.6e6)); // Watch
        sell(d, 3e6);
        // spend allowance down to below T/2
        vm.startPrank(agent);
        d.pay(supplier, 0.9e6, bill());
        d.pay(supplier, 0.5e6, bill());
        vm.stopPrank();
        clearHold(d);
        assertEq(d.allowance(), 1e6, "Watch refills to T/2");
    }

    function test_braked_noRefill() public {
        KibbleDrawer d = earned();
        assertFalse(payS(d, 0.6e6));
        skip(5);
        assertFalse(payS(d, 0.6e6));
        assertEq(uint8(d.state()), uint8(State.Braked));
        uint256 a = d.allowance();
        sell(d, 1e6);
        clearHold(d);
        assertEq(d.allowance(), a, "no refill when braked");
        assertEq(token.balanceOf(address(vault)), 1e6, "value goes to the vault");
    }

    // ------------------------------------------------------------ learning

    function test_learning_calibratesCostBps() public {
        KibbleDrawer d = newDrawer(Mode.EARNED, cfg(3));
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
        for (uint256 i; i < 3; ++i) {
            sell(d, 1e6);
            payS(d, 0.4e6);
            clearHold(d);
            nextWindow(d);
        }
        assertEq(d.learnedCostShareBps(), 4_000, "observed 40%");
        assertEq(d.costBps(), 5_000, "learned + 10 points");
        assertEq(uint8(d.state()), uint8(State.Healthy));
        assertEq(d.limitT(), 2e6, "T stays at Tstart while learning");
    }

    function test_learning_quietWindowsDontCount() public {
        KibbleDrawer d = newDrawer(Mode.EARNED, cfg(2));
        nextWindow(d);
        nextWindow(d);
        assertEq(uint8(d.state()), uint8(State.Learning));
        assertEq(d.learnedWindows(), 0);
    }

    function test_learning_costBpsCappedAt95() public {
        KibbleDrawer d = newDrawer(Mode.EARNED, cfg(1));
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
        sell(d, 1e6);
        payS(d, 0.89e6);
        clearHold(d);
        nextWindow(d);
        assertEq(d.costBps(), 9_500);
    }

    // ------------------------------------------------------------ drawdown and unexplained outflow

    function test_drawdown_brakesAtHalfL_pausesAtL() public {
        KibbleDrawer d = earned();
        vm.startPrank(owner);
        adm(d).tighten(Param.MaxWeeklyLoss, 2e6); // L = 2 for the test
        vm.stopPrank();
        sell(d, 1e6);
        clearHold(d); // net +1, high water 1
        vm.prank(agent);
        d.pay(supplier, 0.9e6, bill()); // net 0.1: drawdown 0.9 < 1
        assertEq(uint8(d.state()), uint8(State.Healthy));
        vm.prank(agent);
        d.pay(supplier, 0.04e6, bill()); // drawdown 0.94
        sell(d, 0.1e6);
        vm.prank(agent);
        d.pay(supplier, 0.06e6, bill()); // drawdown 1.0 = L/2
        assertEq(uint8(d.state()), uint8(State.Braked));
    }

    function test_unexplainedOutflow_pauses() public {
        KibbleDrawer d = earned();
        deal(address(token), address(d), 1e6); // tokens vanish without a payment
        d.sync();
        assertEq(uint8(d.state()), uint8(State.Paused));
        assertBuckets(d);
    }

    // ------------------------------------------------------------ hijack bound

    function test_maxLossNow_isAllowanceAndRunway() public {
        KibbleDrawer d = earned();
        assertEq(d.maxLossNow(), 2e6);
        sell(d, 5e6);
        clearHold(d);
        assertEq(d.maxLossNow(), 2e6, "profit is in the vault, not exposed");
        assertGt(token.balanceOf(address(vault)), 0);
    }

    function test_agentCannotTouchVault() public {
        earned();
        vm.startPrank(agent);
        vm.expectRevert();
        vault.withdrawHome(1);
        vm.expectRevert();
        vault.queueWithdraw(agent, 1);
        vm.stopPrank();
    }

    function _emptyInit() internal pure returns (Init memory i) {}
}
