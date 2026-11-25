// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KibbleBase} from "./KibbleBase.sol";
import {KibbleCore} from "../src/KibbleCore.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {Mode, State, Param, Action, Config} from "../src/KibbleTypes.sol";

/// The owner and guardian side: every setting, every refusal, the whole queue.
contract KibbleAdminTest is KibbleBase {
    function _get(KibbleDrawer d, Param p) internal view returns (uint256) {
        if (p == Param.T) return d.limitT();
        if (p == Param.TMax) return d.tMax();
        if (p == Param.TMin) return d.tMin();
        if (p == Param.CostBps) return d.costBps();
        if (p == Param.ApprovalThreshold) return d.approvalThreshold();
        if (p == Param.UnknownBudget) return d.unknownRemaining();
        if (p == Param.MaxWeeklyLoss) return d.maxWeeklyLoss();
        if (p == Param.GrowthBps) return d.growthBps();
        if (p == Param.MaxStep) return d.maxStep();
        if (p == Param.Slack) return d.slack();
        if (p == Param.CarryBps) return d.carryBps();
        return d.minActivity();
    }

    function _queue(KibbleDrawer d, Action a, bytes memory data) internal returns (bytes32 id) {
        vm.prank(owner);
        id = adm(d).queue(a, data);
    }

    function _raise(KibbleDrawer d, Param p, uint256 v) internal returns (bytes32 id) {
        id = _queue(d, Action.RaiseParam, abi.encode(p, v));
        skip(d.delay() + 1);
    }

    // ------------------------------------------------------------ settings

    /// Every setting can be lowered at once, never raised at once, and raised through the queue.
    function test_everySetting_tightensNow_raisesLater() public {
        for (uint8 i; i < 12; ++i) {
            Param p = Param(i);
            KibbleDrawer d = earned();
            uint256 was = _get(d, p);
            uint256 lower = was - was / 20;
            vm.prank(owner);
            adm(d).tighten(p, lower);
            assertEq(_get(d, p), lower, "lowered");
            vm.prank(owner);
            vm.expectRevert(KibbleCore.NotTighter.selector);
            adm(d).tighten(p, lower + 1);
            bytes32 id = _raise(d, p, was);
            vm.prank(owner);
            adm(d).execute(id);
            assertEq(_get(d, p), was, "raised through the queue");
            assertBuckets(d);
        }
    }

    function test_settings_outOfRange_refused() public {
        KibbleDrawer d = earned();
        uint256 tMin = d.tMin();
        uint256 tMax = d.tMax();
        vm.startPrank(owner);
        vm.expectRevert(KibbleCore.BadConfig.selector);
        adm(d).tighten(Param.T, tMin - 1);
        vm.expectRevert(KibbleCore.BadConfig.selector);
        adm(d).tighten(Param.TMax, tMin - 1);
        vm.expectRevert(KibbleCore.BadConfig.selector);
        adm(d).tighten(Param.MaxWeeklyLoss, 0);
        vm.stopPrank();
        _expectRaiseFails(d, Param.T, tMax + 1);
        _expectRaiseFails(d, Param.TMin, d.limitT() + 1);
        _expectRaiseFails(d, Param.CostBps, 10_001);
        _expectRaiseFails(d, Param.GrowthBps, 10_001);
        _expectRaiseFails(d, Param.CarryBps, 10_001);
    }

    function _expectRaiseFails(KibbleDrawer d, Param p, uint256 v) internal {
        bytes32 id = _raise(d, p, v);
        vm.prank(owner);
        vm.expectRevert(KibbleCore.BadConfig.selector);
        adm(d).execute(id);
    }

    function test_loweringTMax_pullsTAndAllowanceDown_intoTheVault() public {
        KibbleDrawer d = earned(); // T 2, allowance 2
        uint256 before = token.balanceOf(address(vault));
        vm.prank(guardian);
        adm(d).tighten(Param.TMax, 1.5e6);
        assertEq(d.limitT(), 1.5e6);
        assertEq(d.allowance(), 1.5e6);
        assertEq(token.balanceOf(address(vault)) - before, 0.5e6, "the rest went to the vault");
        assertBuckets(d);
    }

    function test_fixedDrawer_canNeverGetAStrangerBudget() public {
        KibbleDrawer f = fixedDrawer(2e6);
        bytes32 id = _raise(f, Param.UnknownBudget, 1);
        vm.prank(owner);
        vm.expectRevert(KibbleCore.WrongMode.selector);
        adm(f).execute(id);
    }

    function test_tightenSupplier_onlyLower_onlyKnown() public {
        KibbleDrawer d = earned();
        vm.startPrank(guardian);
        adm(d).tightenSupplier(supplier, 0.5e6, 1e6);
        vm.expectRevert(KibbleCore.NotTighter.selector);
        adm(d).tightenSupplier(supplier, 0.6e6, 1e6);
        vm.expectRevert(KibbleCore.NotTighter.selector);
        adm(d).tightenSupplier(supplier, 0.5e6, 2e6);
        vm.expectRevert(KibbleCore.NotTighter.selector);
        adm(d).tightenSupplier(supplier2, 0, 0);
        adm(d).removeSupplier(supplier);
        adm(d).removeAcceptor(acceptor);
        vm.stopPrank();
        (bool ok,,,,) = d.suppliers(supplier);
        assertFalse(ok);
        (bool ok2,,,) = d.acceptors(acceptor);
        assertFalse(ok2);
    }

    // ------------------------------------------------------------ queue

    function test_queue_lifecycle_andEveryWrongTurn() public {
        KibbleDrawer d = earned();
        bytes32 id = _queue(d, Action.RaiseParam, abi.encode(Param.Slack, uint256(0.2e6)));
        vm.startPrank(owner);
        vm.expectRevert(KibbleCore.NotReady.selector);
        adm(d).execute(id);
        skip(d.delay() + 1);
        adm(d).execute(id);
        vm.expectRevert(KibbleCore.NotQueued.selector);
        adm(d).execute(id); // once only
        vm.expectRevert(KibbleCore.NotQueued.selector);
        adm(d).cancel(id); // too late
        vm.expectRevert(KibbleCore.NotQueued.selector);
        adm(d).execute(keccak256("never queued"));
        vm.stopPrank();
        assertEq(d.slack(), 0.2e6);

        bytes32 id2 = _queue(d, Action.RaiseParam, abi.encode(Param.Slack, uint256(0.3e6)));
        vm.prank(owner);
        adm(d).cancel(id2);
        skip(d.delay() + 1);
        vm.prank(owner);
        vm.expectRevert(KibbleCore.NotQueued.selector);
        adm(d).execute(id2);
    }

    function test_queue_strangersCantExecuteOrCancel() public {
        KibbleDrawer d = earned();
        bytes32 id = _raise(d, Param.Slack, 0.2e6);
        address[3] memory who = [agent, attacker, guardian];
        for (uint256 i; i < 3; ++i) {
            vm.prank(who[i]);
            vm.expectRevert(KibbleCore.NotOwner.selector);
            adm(d).execute(id);
        }
        vm.prank(attacker);
        vm.expectRevert(KibbleCore.NotOwnerOrGuardian.selector);
        adm(d).cancel(id);
    }

    function test_queue_revokedDrawer_executesNothing() public {
        KibbleDrawer d = earned();
        bytes32 id = _raise(d, Param.Slack, 0.2e6);
        vm.startPrank(owner);
        adm(d).revoke();
        vm.expectRevert(KibbleCore.Inactive.selector);
        adm(d).execute(id);
        vm.stopPrank();
    }

    function test_queue_addAcceptor() public {
        KibbleDrawer d = earned();
        address acc2 = makeAddr("acceptor2");
        bytes32 id = _queue(d, Action.AddAcceptor, abi.encode(acc2, uint128(1e6)));
        skip(d.delay() + 1);
        vm.prank(owner);
        adm(d).execute(id);
        (bool ok, uint128 per,,) = d.acceptors(acc2);
        assertTrue(ok);
        assertEq(per, 1e6);

        bytes32 bad = _queue(d, Action.AddAcceptor, abi.encode(agent, uint128(1e6)));
        skip(d.delay() + 1);
        vm.prank(owner);
        vm.expectRevert(KibbleCore.BadConfig.selector);
        adm(d).execute(bad);
    }

    function test_setAgent_neverAKeyThatWouldBreakTheSplit() public {
        KibbleDrawer d = earned();
        address[5] memory bad = [address(0), owner, guardian, acceptor, supplier];
        for (uint256 i; i < bad.length; ++i) {
            bytes32 id = _queue(d, Action.SetAgent, abi.encode(bad[i]));
            skip(d.delay() + 1);
            vm.prank(owner);
            vm.expectRevert(KibbleCore.BadConfig.selector);
            adm(d).execute(id);
        }
    }

    function test_setGuardian_neverTheAgentOrNobody() public {
        KibbleDrawer d = earned();
        address[2] memory bad = [address(0), agent];
        for (uint256 i; i < 2; ++i) {
            bytes32 id = _queue(d, Action.SetGuardian, abi.encode(bad[i]));
            skip(uint256(d.delay()) * 7 + 1);
            vm.prank(owner);
            vm.expectRevert(KibbleCore.BadConfig.selector);
            adm(d).execute(id);
        }
    }

    function test_setGuardian_ownerCanCancel() public {
        KibbleDrawer d = earned();
        bytes32 id = _queue(d, Action.SetGuardian, abi.encode(makeAddr("g2")));
        vm.prank(guardian);
        vm.expectRevert(KibbleCore.GuardianCannotCancel.selector);
        adm(d).cancel(id);
        vm.prank(owner);
        adm(d).cancel(id);
    }

    function test_resume_queued_nothingToResume() public {
        KibbleDrawer d = earned();
        bytes32 id = _queue(d, Action.Resume, "");
        skip(d.delay() + 1);
        vm.prank(owner);
        vm.expectRevert(KibbleCore.NothingToResume.selector);
        adm(d).execute(id);
    }

    // ------------------------------------------------------------ instant resume

    function test_resumeNow_everyBadSignature() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).freeze();
        uint256 dl = block.timestamp + 1 hours;
        bytes memory o = signResume(ownerPk, d, dl);
        bytes memory g = signResume(guardianPk, d, dl);
        vm.expectRevert(KibbleCore.BadSignature.selector);
        adm(d).resumeNow(dl, g, o); // swapped
        vm.expectRevert(KibbleCore.BadSignature.selector);
        adm(d).resumeNow(dl, o, o); // the owner twice
        vm.expectRevert(KibbleCore.BadSignature.selector);
        adm(d).resumeNow(dl, g, g);
        vm.expectRevert(KibbleCore.BadSignature.selector);
        adm(d).resumeNow(dl + 1, o, g); // another deadline
        vm.expectRevert(KibbleCore.BadSignature.selector);
        adm(d).resumeNow(dl, hex"1234", g);
        vm.expectRevert(KibbleCore.BadSignature.selector);
        adm(d).resumeNow(dl, o, hex"");
        uint256 snap = vm.snapshotState();
        vm.warp(dl + 1);
        vm.expectRevert(KibbleCore.Expired.selector);
        adm(d).resumeNow(dl, o, g);
        vm.revertToState(snap);

        vm.prank(attacker); // anyone may carry the two signatures
        adm(d).resumeNow(dl, o, g);
        assertEq(uint8(d.state()), uint8(State.Watch));
        vm.prank(owner);
        adm(d).freeze();
        vm.expectRevert(KibbleCore.BadSignature.selector);
        adm(d).resumeNow(dl, o, g); // used once: the nonce moved on
    }

    function test_resumeNow_signaturesForAnotherDrawer_refused() public {
        KibbleDrawer d = earned();
        KibbleDrawer e = earned();
        vm.startPrank(owner);
        adm(d).freeze();
        adm(e).freeze();
        vm.stopPrank();
        uint256 dl = block.timestamp + 1 hours;
        bytes memory o = signResume(ownerPk, d, dl);
        bytes memory g = signResume(guardianPk, d, dl);
        vm.expectRevert(KibbleCore.BadSignature.selector);
        adm(e).resumeNow(dl, o, g);
    }

    function test_resumeNow_nothingToResume() public {
        KibbleDrawer d = earned();
        uint256 dl = block.timestamp + 1 hours;
        bytes memory o = signResume(ownerPk, d, dl);
        bytes memory g = signResume(guardianPk, d, dl);
        vm.expectRevert(KibbleCore.NothingToResume.selector);
        adm(d).resumeNow(dl, o, g);
    }

    function test_resume_fixedGoesHealthyAndRefills_learningGoesBackToLearning() public {
        KibbleDrawer f = fixedDrawer(2e6);
        KibbleDrawer l = newDrawer(Mode.EARNED, cfg(5));
        vm.startPrank(owner);
        adm(f).freeze();
        adm(l).freeze();
        vm.stopPrank();
        uint256 dl = block.timestamp + 1 hours;
        adm(f).resumeNow(dl, signResume(ownerPk, f, dl), signResume(guardianPk, f, dl));
        adm(l).resumeNow(dl, signResume(ownerPk, l, dl), signResume(guardianPk, l, dl));
        assertEq(uint8(f.state()), uint8(State.Healthy));
        assertEq(f.allowance(), 2e6);
        assertEq(uint8(l.state()), uint8(State.Learning));
    }

    // ------------------------------------------------------------ money in

    function test_fundAllowance_neverAboveTheRefillCap() public {
        KibbleDrawer d = newDrawer(Mode.EARNED, cfg(0)); // T 2
        vm.startPrank(owner);
        vm.expectRevert(KibbleCore.OverRoom.selector);
        adm(d).fundAllowance(2e6 + 1);
        adm(d).fundAllowance(2e6);
        vm.expectRevert(KibbleCore.OverRoom.selector);
        adm(d).fundAllowance(1);
        vm.stopPrank();
        assertBuckets(d);
    }

    function test_workBudget_fundReclaim_wrongMode() public {
        KibbleDrawer d = earned();
        uint256 before = token.balanceOf(address(vault));
        vm.startPrank(owner);
        adm(d).fundWorkBudget(5e6);
        adm(d).reclaimWorkBudget(2e6);
        assertEq(d.workBudget(), 3e6);
        adm(d).reclaimWorkBudget(99e6); // asks for more than there is: takes what's there
        assertEq(d.workBudget(), 0);
        vm.stopPrank();
        assertEq(token.balanceOf(address(vault)) - before, 5e6);
        KibbleDrawer f = fixedDrawer(2e6);
        vm.startPrank(owner);
        vm.expectRevert(KibbleCore.WrongMode.selector);
        adm(f).fundWorkBudget(1);
        vm.expectRevert(KibbleCore.WrongMode.selector);
        adm(f).grantRunway(1, uint64(block.timestamp + 10));
        vm.stopPrank();
        assertBuckets(d);
    }

    function test_runway_badTimes_andPaused() public {
        KibbleDrawer d = earned();
        vm.startPrank(owner);
        vm.expectRevert(KibbleCore.OverRoom.selector);
        adm(d).grantRunway(1e6, uint64(block.timestamp));
        adm(d).freeze();
        vm.expectRevert(KibbleCore.Inactive.selector);
        adm(d).grantRunway(1e6, uint64(block.timestamp + 100));
        vm.stopPrank();
    }

    // ------------------------------------------------------------ the end

    function test_revoke_twice_andFreezeAfter_changeNothing() public {
        KibbleDrawer d = earned();
        vm.startPrank(guardian);
        adm(d).revoke();
        adm(d).revoke();
        adm(d).freeze();
        vm.stopPrank();
        assertEq(uint8(d.state()), uint8(State.Revoked));
        assertEq(d.maxLossNow(), 0);
        // money sent to it later still goes to the owner
        token.mint(address(d), 1e6);
        uint256 before = token.balanceOf(address(vault));
        d.sync();
        assertEq(token.balanceOf(address(vault)) - before, 1e6);
    }

    function test_unknownFunction_reverts() public {
        KibbleDrawer d = earned();
        (bool ok,) = address(d).call(abi.encodeWithSignature("drainEverything()"));
        assertFalse(ok);
    }
}
