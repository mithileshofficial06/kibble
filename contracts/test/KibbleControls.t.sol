// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KibbleBase} from "./KibbleBase.sol";
import {Signing} from "./Signing.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {KibbleCore} from "../src/KibbleCore.sol";
import {KibbleAdmin} from "../src/KibbleAdmin.sol";
import {Mode, State, Param, Action, Config} from "../src/KibbleTypes.sol";

/// Owner and guardian controls, fixed mode, runway grants and gasless buying.
contract KibbleControlsTest is KibbleBase {
    // ------------------------------------------------------------ freeze, revoke

    function test_freeze_byGuardian_stopsPayments() public {
        KibbleDrawer d = earned();
        vm.prank(guardian);
        adm(d).freeze();
        assertEq(uint8(d.state()), uint8(State.Paused));
        assertFalse(payS(d, 0.01e6));
    }

    function test_freeze_onlyOwnerOrGuardian() public {
        KibbleDrawer d = earned();
        vm.prank(agent);
        vm.expectRevert(KibbleCore.NotOwnerOrGuardian.selector);
        adm(d).freeze();
    }

    function test_revoke_sweepsEverythingToVault() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).fundWorkBudget(5e6);
        sell(d, 1e6);
        vm.prank(owner);
        adm(d).revoke();
        assertEq(token.balanceOf(address(d)), 0);
        assertEq(token.balanceOf(address(vault)), 8e6);
        assertEq(uint8(d.state()), uint8(State.Revoked));
        // later transfers in also go to the vault
        token.mint(address(d), 1e6);
        d.sync();
        assertEq(token.balanceOf(address(vault)), 9e6);
    }

    function test_incomeWhilePaused_neverCountsAsValue() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).freeze();
        token.mint(address(d), 3e6);
        d.sync();
        assertEq(d.lifetimeValue(), 0);
        assertEq(token.balanceOf(address(vault)), 3e6);
    }

    // ------------------------------------------------------------ tighten fast, loosen slow

    function test_tighten_isInstant_butCannotRaise() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).tighten(Param.T, 1e6);
        assertEq(d.limitT(), 1e6);
        assertEq(d.allowance(), 1e6, "allowance trimmed to T");
        assertEq(token.balanceOf(address(vault)), 1e6);
        vm.prank(owner);
        vm.expectRevert(KibbleCore.NotTighter.selector);
        adm(d).tighten(Param.T, 2e6);
        assertBuckets(d);
    }

    function test_guardianCanTighten() public {
        KibbleDrawer d = earned();
        vm.prank(guardian);
        adm(d).tighten(Param.UnknownBudget, 0);
        assertEq(d.unknownRemaining(), 0);
    }

    function test_queue_raiseWaitsForDelay() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        bytes32 id = adm(d).queue(Action.RaiseParam, abi.encode(Param.T, uint256(5e6)));
        vm.prank(owner);
        vm.expectRevert(KibbleCore.NotReady.selector);
        adm(d).execute(id);
        skip(d.delay());
        vm.prank(owner);
        adm(d).execute(id);
        assertEq(d.limitT(), 5e6);
    }

    function test_queue_guardianCancels() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        bytes32 id = adm(d).queue(Action.AddSupplier, abi.encode(attacker, uint128(5e6), uint128(5e6)));
        vm.prank(guardian);
        adm(d).cancel(id);
        skip(d.delay());
        vm.prank(owner);
        vm.expectRevert(KibbleCore.NotQueued.selector);
        adm(d).execute(id);
        (bool ok,,,,) = d.suppliers(attacker);
        assertFalse(ok);
    }

    function test_queue_onlyOwnerQueues() public {
        KibbleDrawer d = earned();
        vm.prank(guardian);
        vm.expectRevert(KibbleCore.NotOwner.selector);
        adm(d).queue(Action.Resume, "");
    }

    function test_setGuardian_waitsLonger_andGuardianCannotCancel() public {
        KibbleDrawer d = earned();
        address newGuardian = makeAddr("newGuardian");
        vm.prank(owner);
        bytes32 id = adm(d).queue(Action.SetGuardian, abi.encode(newGuardian));
        vm.prank(guardian);
        vm.expectRevert(KibbleCore.GuardianCannotCancel.selector);
        adm(d).cancel(id);
        skip(d.delay());
        vm.prank(owner);
        vm.expectRevert(KibbleCore.NotReady.selector);
        adm(d).execute(id);
        skip(d.delay() * 6);
        vm.prank(owner);
        adm(d).execute(id);
        assertEq(d.guardian(), newGuardian);
    }

    function test_addSupplier_throughQueue() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        bytes32 id = adm(d).queue(Action.AddSupplier, abi.encode(supplier2, uint128(0.5e6), uint128(0)));
        skip(d.delay());
        vm.prank(owner);
        adm(d).execute(id);
        (bool ok, uint128 perPayment, uint128 perWindow,,) = d.suppliers(supplier2);
        assertTrue(ok);
        assertEq(perPayment, 0.5e6);
        assertEq(perWindow, d.tMax(), "default window cap = Tmax");
    }

    function test_setAgent_rotatesKey() public {
        KibbleDrawer d = earned();
        address newAgent = makeAddr("newAgent");
        vm.prank(owner);
        bytes32 id = adm(d).queue(Action.SetAgent, abi.encode(newAgent));
        skip(d.delay());
        vm.prank(owner);
        adm(d).execute(id);
        vm.prank(agent);
        vm.expectRevert(KibbleCore.NotAgent.selector);
        d.pay(supplier, 1, bill());
    }

    // ------------------------------------------------------------ resume

    function _pauseByStrikes(KibbleDrawer d) internal {
        for (uint256 i; i < 3; ++i) {
            payS(d, 0.6e6);
            skip(5);
        }
        assertEq(uint8(d.state()), uint8(State.Paused));
    }

    function test_resumeNow_needsOwnerAndGuardian() public {
        KibbleDrawer d = earned();
        _pauseByStrikes(d);
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory o = signResume(ownerPk, d, dl);
        bytes memory g = signResume(guardianPk, d, dl);
        bytes memory bad = signResume(buyerPk, d, dl);
        vm.expectRevert(KibbleCore.BadSignature.selector);
        adm(d).resumeNow(dl, o, bad);
        adm(d).resumeNow(dl, o, g);
        assertEq(uint8(d.state()), uint8(State.Watch), "resume lands in Watch");
        assertEq(d.strikes(), 0);
        vm.expectRevert(KibbleCore.BadSignature.selector); // nonce moved: can't replay
        adm(d).resumeNow(dl, o, g);
    }

    function test_resume_queued() public {
        KibbleDrawer d = earned();
        _pauseByStrikes(d);
        vm.prank(owner);
        bytes32 id = adm(d).queue(Action.Resume, "");
        skip(d.delay());
        vm.prank(owner);
        adm(d).execute(id);
        assertEq(uint8(d.state()), uint8(State.Watch));
    }

    function test_adminModule_cannotBeUsedDirectly() public {
        KibbleDrawer d = earned();
        KibbleAdmin m = KibbleAdmin(d.adminModule());
        vm.prank(owner);
        vm.expectRevert(KibbleCore.NotOwnerOrGuardian.selector);
        m.freeze();
    }

    // ------------------------------------------------------------ fixed mode (the comparison side)

    function test_fixed_flatLimitRefilledEveryWindow_noCeiling() public {
        KibbleDrawer f = fixedDrawer(3e6);
        assertEq(f.allowance(), 3e6);
        assertEq(f.reserve(), 27e6);
        vm.startPrank(agent);
        assertTrue(f.pay(supplier, 1e6, bill()), "no ceiling: spends with zero income");
        assertTrue(f.pay(supplier, 1e6, bill()));
        assertTrue(f.pay(supplier, 1e6, bill()));
        assertFalse(f.pay(supplier, 0.5e6, bill()), "flat limit hit: sales turned away");
        vm.stopPrank();
        nextWindow(f);
        assertEq(f.allowance(), 3e6, "refilled to the flat limit");
        assertEq(uint8(f.state()), uint8(State.Healthy), "no ladder: a loss only raises an alert");
        assertEq(token.balanceOf(address(vault)), 0, "no sweep");
    }

    function test_fixed_strangerRefused_noUnknownBudget() public {
        KibbleDrawer f = fixedDrawer(3e6);
        vm.prank(agent);
        assertFalse(f.pay(attacker, 0.1e6, bill()));
        assertEq(f.unknownRemaining(), 0);
    }

    function test_fixed_maxLossNowIsTheWholeDrawer() public {
        KibbleDrawer f = fixedDrawer(3e6);
        assertEq(f.maxLossNow(), 30e6);
    }

    function test_fixed_incomeGoesToReserve() public {
        KibbleDrawer f = fixedDrawer(3e6);
        sell(f, 1e6);
        clearHold(f);
        assertEq(f.reserve(), 28e6);
        assertBuckets(f);
    }

    // ------------------------------------------------------------ runway (V5)

    function test_runway_investmentIsNotALoss() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).grantRunway(5e6, uint64(block.timestamp + 1 days));
        vm.prank(owner);
        adm(d).tightenSupplier(supplier, 1e6, 10e6);
        // buys a 1 tUSD8 dataset five times with zero income: no ceiling, no loss
        for (uint256 i; i < 5; ++i) {
            assertTrue(payS(d, 1e6));
        }
        assertEq(d.runway(), 0);
        assertEq(d.windowSpend(), 0, "runway spend is not counted");
        nextWindow(d);
        assertEq(uint8(d.state()), uint8(State.Healthy), "not braked");
        assertEq(d.limitT(), 2e6);
    }

    function test_runway_cappedByMaxWeeklyLoss() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        vm.expectRevert(KibbleCore.OverRoom.selector);
        adm(d).grantRunway(21e6, uint64(block.timestamp + 1 days));
    }

    function test_runway_expiresToVault() public {
        KibbleDrawer d = earned();
        vm.prank(owner);
        adm(d).grantRunway(5e6, uint64(block.timestamp + 100));
        assertEq(d.maxLossNow(), 7e6, "allowance + runway");
        skip(101);
        d.sync();
        assertEq(d.runway(), 0);
        assertEq(token.balanceOf(address(vault)), 5e6);
        assertEq(d.maxLossNow(), 2e6);
    }

    // ------------------------------------------------------------ gasless buy (EIP-3009)

    function test_buyWithAuthorization() public {
        KibbleDrawer d = earned();
        bytes32 b = bill();
        Signing.Auth memory a = Signing.Auth({
            from: buyer,
            to: address(d),
            value: 0.1e6,
            validAfter: 0,
            validBefore: block.timestamp + 1 hours,
            nonce: d.saleNonce(b)
        });
        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(vm, buyerPk, token.DOMAIN_SEPARATOR(), a);
        vm.prank(attacker); // any relayer
        d.buyWithAuthorization(b, buyer, 0.1e6, 0, a.validBefore, v, r, s);
        assertEq(d.pendingTotal(), 0.1e6);
        (address payer,,,,) = d.pendings(0);
        assertEq(payer, buyer);
    }

    function test_buyWithAuthorization_boundToBill() public {
        KibbleDrawer d = earned();
        bytes32 b = bill();
        Signing.Auth memory a = Signing.Auth({
            from: buyer,
            to: address(d),
            value: 0.1e6,
            validAfter: 0,
            validBefore: block.timestamp + 1 hours,
            nonce: d.saleNonce(b)
        });
        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(vm, buyerPk, token.DOMAIN_SEPARATOR(), a);
        bytes32 other = bill();
        vm.expectRevert();
        d.buyWithAuthorization(other, buyer, 0.1e6, 0, a.validBefore, v, r, s);
    }
}
