// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KibbleBase} from "./KibbleBase.sol";
import {KibbleCore} from "../src/KibbleCore.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {KibbleVault} from "../src/KibbleVault.sol";
import {Mode, State, Param, Action, Config, Init, Snapshot} from "../src/KibbleTypes.sol";

/// Rare states of the drawer and vault: outflows, income while paused, rolling drawdown, bad set-ups.
contract KibbleEdgesTest is KibbleBase {
    // ------------------------------------------------------------ set-up

    function _init() internal view returns (Init memory i) {
        i.token = token;
        i.mode = Mode.EARNED;
        i.owner = owner;
        i.guardian = guardian;
        i.agent = agent;
        i.vault = address(vault);
        i.cfg = cfg(0);
    }

    function _initFails(Init memory i, bytes4 why) internal {
        KibbleDrawer d = KibbleDrawer(Clones.clone(factory.drawerImpl()));
        vm.expectRevert(why);
        d.initialize(i);
    }

    function test_initialize_everyZeroAddress_refused() public {
        Init memory i = _init();
        i.token = IERC20(address(0));
        _initFails(i, KibbleCore.ZeroAddress.selector);
        i = _init();
        i.owner = address(0);
        _initFails(i, KibbleCore.ZeroAddress.selector);
        i = _init();
        i.guardian = address(0);
        _initFails(i, KibbleCore.ZeroAddress.selector);
        i = _init();
        i.agent = address(0);
        _initFails(i, KibbleCore.ZeroAddress.selector);
        i = _init();
        i.vault = address(0);
        _initFails(i, KibbleCore.ZeroAddress.selector);
        vm.expectRevert(KibbleCore.ZeroAddress.selector);
        new KibbleDrawer(address(0));
    }

    function test_vault_zeroAddresses_andOnlyOwner() public {
        vm.expectRevert(KibbleVault.ZeroAddress.selector);
        new KibbleVault(IERC20(address(0)), owner, guardian, 1 days);
        vm.expectRevert(KibbleVault.ZeroAddress.selector);
        new KibbleVault(token, address(0), guardian, 1 days);
        vm.expectRevert(KibbleVault.ZeroAddress.selector);
        new KibbleVault(token, owner, address(0), 1 days);
        vm.prank(agent);
        vm.expectRevert(KibbleVault.NotOwner.selector);
        vault.withdrawHome(1);
    }

    // ------------------------------------------------------------ tokens that leave without a payment

    function _leave(KibbleDrawer d, uint256 amount) internal {
        vm.prank(address(d));
        token.transfer(attacker, amount);
        d.sync();
    }

    function test_outflow_throughEveryBucket_neverBreaksTheBooks() public {
        KibbleDrawer d = earned(); // allowance 2
        vm.startPrank(owner);
        adm(d).fundWorkBudget(3e6);
        adm(d).grantRunway(1e6, uint64(block.timestamp + 1 days));
        vm.stopPrank();
        sell(d, 4e6);
        uint256 total = token.balanceOf(address(d));
        _leave(d, total - 1e6); // allowance, runway and work budget gone, and most of the sale
        assertEq(uint8(d.state()), uint8(State.Paused));
        assertEq(d.allowance() + d.runway() + d.workBudget(), 0);
        assertEq(d.pendingTotal(), 1e6);
        assertBuckets(d);
        // the sale is larger than what's left: it clears for what's there, as nothing the agent earned
        uint256 before = token.balanceOf(address(vault));
        clearHold(d);
        assertEq(d.pendingTotal(), 0);
        assertEq(d.lifetimeValue(), 0);
        assertEq(token.balanceOf(address(vault)) - before, 1e6);
        assertBuckets(d);
    }

    function test_outflow_fixedDrawer_takesTheReserveFirst() public {
        KibbleDrawer f = fixedDrawer(2e6); // allowance 2, reserve 28
        uint256 reserve = f.reserve();
        _leave(f, 5e6);
        assertEq(f.reserve(), reserve - 5e6);
        assertEq(f.allowance(), 2e6);
        assertEq(uint8(f.state()), uint8(State.Paused));
        assertBuckets(f);
    }

    // ------------------------------------------------------------ income

    function test_income_whilePaused_goesToTheOwner_andEarnsNothing() public {
        KibbleDrawer d = earned();
        sell(d, 3e6);
        uint256 allowance = d.allowance();
        vm.prank(guardian);
        adm(d).freeze();
        uint256 before = token.balanceOf(address(vault));
        clearHold(d);
        assertEq(d.lifetimeValue(), 0, "no value");
        assertEq(d.allowance(), allowance, "no refill");
        assertEq(token.balanceOf(address(vault)) - before, 3e6, "swept to the vault");
        assertBuckets(d);
    }

    function test_buyers_unknownBill_cantAckOrRefund() public {
        KibbleDrawer d = earned();
        vm.prank(buyer);
        vm.expectRevert(KibbleCore.BadBillRef.selector);
        d.ackDelivery(keccak256("no such bill"));
        vm.prank(agent);
        vm.expectRevert(KibbleCore.BadBillRef.selector);
        d.refund(keccak256("no such bill"));
        bytes32 b = sell(d, 1e6);
        vm.startPrank(buyer);
        d.ackDelivery(b);
        vm.expectRevert(KibbleCore.NotPending.selector);
        d.ackDelivery(b);
        vm.stopPrank();
    }

    function test_revokedDrawer_refundsNothing() public {
        KibbleDrawer d = earned();
        bytes32 b = sell(d, 1e6);
        vm.prank(owner);
        adm(d).revoke();
        vm.prank(owner);
        vm.expectRevert();
        d.refund(b);
    }

    function test_creditWork_pausedExpiredTwiceForgedStranger() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).fundWorkBudget(5e6);
        uint256 dl = block.timestamp + 1 hours;
        bytes32 job = keccak256("job");
        bytes memory good = signWork(acceptorPk, d, job, 1e6, dl);
        bytes memory stranger = signWork(buyerPk, d, job, 1e6, dl);
        vm.expectRevert(KibbleCore.NotAcceptor.selector);
        d.creditWork(job, 1e6, dl, stranger);
        vm.expectRevert(KibbleCore.BadSignature.selector);
        d.creditWork(job, 1e6, dl, hex"1234");
        uint256 snap = vm.snapshotState();
        vm.warp(dl + 1);
        vm.expectRevert(KibbleCore.Expired.selector);
        d.creditWork(job, 1e6, dl, good);
        vm.revertToState(snap);
        d.creditWork(job, 1e6, dl, good);
        vm.expectRevert(KibbleCore.AlreadyCredited.selector);
        d.creditWork(job, 1e6, dl, good);
        vm.prank(owner);
        adm(d).freeze();
        vm.expectRevert(KibbleCore.Inactive.selector);
        d.creditWork(job, 1e6, dl, good);
    }

    // ------------------------------------------------------------ windows and the ladder

    function test_drawdown_markRollsOncePerPeriod() public {
        KibbleDrawer d = earned();
        sell(d, 2e6);
        clearHold(d);
        payS(d, 1e6);
        nextWindow(d);
        assertEq(d.drawdown(), 1e6, "below the mark");
        skip(d.drawdownPeriod());
        nextWindow(d);
        assertEq(d.drawdown(), 0, "a new period starts from here");
    }

    function test_braked_aProfitWindow_backToWatch_thenHealthy() public {
        KibbleDrawer d = earned();
        // three strikes: too much for what was earned, each after the cooldown
        for (uint256 i; i < 2; ++i) {
            skip(d.strikeCooldown() + 1);
            payS(d, 1e6);
        }
        assertEq(uint8(d.state()), uint8(State.Braked));
        nextWindow(d);
        sell(d, 2e6);
        clearHold(d);
        nextWindow(d);
        assertEq(uint8(d.state()), uint8(State.Watch), "a profitable window");
        for (uint256 i; i < 2; ++i) {
            sell(d, 2e6);
            clearHold(d);
            nextWindow(d);
        }
        assertEq(uint8(d.state()), uint8(State.Healthy), "two clean windows");
        assertBuckets(d);
    }

    function test_lossWindow_lowersT_andTrimsTheAllowance() public {
        KibbleDrawer d = earned();
        skip(d.windowLength() - 5); // too late to clear in this window
        sell(d, 4e6); // room to spend against, still unconfirmed
        payS(d, 0.6e6); // spend with no cleared value yet: a loss window
        vm.prank(owner);
        adm(d).fundAllowance(0.6e6); // back to 2
        uint256 before = token.balanceOf(address(vault));
        nextWindow(d);
        assertEq(d.limitT(), 1.4e6);
        assertEq(d.allowance(), 1.4e6);
        assertEq(token.balanceOf(address(vault)) - before, 0.6e6, "the rest went to the vault");
        assertBuckets(d);
    }

    function test_fixedDrawer_refillsOnlyWhatTheReserveHolds() public {
        Config memory c = cfg(0);
        c.fixedLimit = 2e6;
        KibbleDrawer f = newDrawer(Mode.FIXED, c);
        vm.prank(owner);
        adm(f).fundAllowance(2.5e6); // allowance 2, reserve 0.5
        payS(f, 1e6);
        nextWindow(f);
        assertEq(f.allowance(), 1.5e6, "1 left + the 0.5 in reserve");
        assertEq(f.reserve(), 0);
        assertBuckets(f);
    }

    // ------------------------------------------------------------ views

    function test_views_sayTheSameAsTheDrawer() public {
        KibbleDrawer d = earned();
        KibbleDrawer f = fixedDrawer(2e6);
        Snapshot memory s = d.snapshot();
        assertEq(s.limitT, d.limitT());
        assertEq(s.allowance, d.allowance());
        assertEq(s.maxLossNow, d.maxLossNow());
        assertEq(s.balance, token.balanceOf(address(d)));
        assertEq(s.windowEndsAt, d.windowStart() + d.windowLength());
        assertEq(f.skimBps(), 0, "no ceiling to skim under");
        assertEq(f.ceilingRoom(), type(uint256).max);
        vm.prank(owner);
        bytes32 id = adm(d).queue(Action.RaiseParam, abi.encode(Param.Slack, uint256(0.2e6)));
        assertGt(d.queued(id).readyAt, block.timestamp);
    }

    function test_skimBps_isTheGapAboveTheLearnedShare() public {
        KibbleDrawer d = newDrawer(Mode.EARNED, cfg(1));
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
        sell(d, 2e6);
        clearHold(d);
        payS(d, 1e6);
        nextWindow(d);
        assertEq(d.learnedCostShareBps(), 5_000);
        assertEq(d.skimBps(), d.costBps() - 5_000);
    }
}
