// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KibbleBase} from "./KibbleBase.sol";
import {KibbleCore} from "../src/KibbleCore.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {KibbleFactory} from "../src/KibbleFactory.sol";
import {KibbleVault} from "../src/KibbleVault.sol";
import {Mode, State, Param, Action, Config, Init, SupplierInit, AcceptorInit} from "../src/KibbleTypes.sol";

/// Every door that should be shut: wrong caller, wrong state, wrong input.
contract KibbleErrorsTest is KibbleBase {
    function test_factory_oneVaultPerOwner_andNoDrawerWithoutOne() public {
        vm.prank(owner);
        vm.expectRevert(KibbleFactory.VaultExists.selector);
        factory.createVault(guardian, 1 days);

        Config memory c = cfg(0);
        vm.prank(attacker);
        vm.expectRevert(KibbleFactory.NoVault.selector);
        factory.createDrawer(Mode.EARNED, agent, c, new SupplierInit[](0), new AcceptorInit[](0), "x");
    }

    function test_factory_defaultConfig_makesAWorkingDrawer() public {
        Config memory c = factory.defaultConfig(L);
        KibbleDrawer d = newDrawer(Mode.EARNED, c);
        assertEq(d.windowLength(), 1 days);
        assertEq(uint8(d.state()), uint8(State.Learning));
        assertEq(factory.drawerCount(), 1);
        assertEq(factory.drawers(0), address(d));
    }

    function test_drawer_cantBeInitializedTwice() public {
        KibbleDrawer d = earned();
        Init memory i;
        i.token = token;
        (i.owner, i.guardian, i.agent, i.vault) = (attacker, attacker, buyer, address(vault));
        i.cfg = cfg(0);
        vm.expectRevert();
        d.initialize(i);
        KibbleDrawer impl = KibbleDrawer(factory.drawerImpl());
        vm.expectRevert(); // nor the implementation behind the clones
        impl.initialize(i);
    }

    function test_drawer_badConfigs_refused() public {
        Config memory c = cfg(0);
        c.maxWeeklyLoss = 0;
        _expectBad(Mode.EARNED, agent, c);
        c = cfg(0);
        c.windowLength = 0;
        _expectBad(Mode.EARNED, agent, c);
        c = cfg(0);
        c.growthBps = 10_001;
        _expectBad(Mode.EARNED, agent, c);
        _expectBad(Mode.FIXED, agent, cfg(0)); // no fixedLimit
        _expectBad(Mode.EARNED, owner, cfg(0)); // the agent key is the owner
        _expectBad(Mode.EARNED, guardian, cfg(0));
        c = cfg(0);
        c.tMin = L;
        _expectBad(Mode.EARNED, agent, c);
    }

    function _expectBad(Mode m, address a, Config memory c) internal {
        vm.prank(owner);
        vm.expectRevert(KibbleCore.BadConfig.selector);
        factory.createDrawer(m, a, c, new SupplierInit[](0), new AcceptorInit[](0), "x");
    }

    function test_drawer_suppliersThatWouldBreakTheBound_refused() public {
        address[3] memory bad = [agent, address(vault), address(0)];
        for (uint256 i; i < bad.length; ++i) {
            SupplierInit[] memory s = new SupplierInit[](1);
            s[0] = SupplierInit({payee: bad[i], perPayment: 1e6, perWindow: 0});
            Config memory c = cfg(0);
            vm.prank(owner);
            vm.expectRevert(KibbleCore.BadConfig.selector);
            factory.createDrawer(Mode.EARNED, agent, c, s, new AcceptorInit[](0), "x");
        }
    }

    function test_onlyTheAgentPays() public {
        KibbleDrawer d = earned();
        address[4] memory others = [owner, guardian, attacker, supplier];
        for (uint256 i; i < others.length; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(KibbleCore.NotAgent.selector);
            d.pay(supplier, 0.1e6, bytes32(i + 1));
        }
    }

    function test_agentAndStrangers_cantUseOwnerFunctions() public {
        KibbleDrawer d = earned();
        address[2] memory who = [agent, attacker];
        for (uint256 i; i < who.length; ++i) {
            vm.startPrank(who[i]);
            vm.expectRevert(KibbleCore.NotOwner.selector);
            adm(d).fundAllowance(1);
            vm.expectRevert(KibbleCore.NotOwner.selector);
            adm(d).grantRunway(1, uint64(block.timestamp + 1));
            vm.expectRevert(KibbleCore.NotOwner.selector);
            adm(d).queue(Action.Resume, "");
            vm.expectRevert(KibbleCore.NotOwnerOrGuardian.selector);
            adm(d).freeze();
            vm.expectRevert(KibbleCore.NotOwnerOrGuardian.selector);
            adm(d).revoke();
            vm.expectRevert(KibbleCore.NotOwnerOrGuardian.selector);
            adm(d).tighten(Param.Slack, 0);
            vm.expectRevert(KibbleCore.NotOwnerOrGuardian.selector);
            adm(d).removeSupplier(supplier);
            vm.stopPrank();
        }
    }

    function test_sales_badBills_refused() public {
        KibbleDrawer d = earned();
        bytes32 b = sell(d, 1e6);
        vm.startPrank(buyer);
        vm.expectRevert(KibbleCore.BadBillRef.selector);
        d.buy(b, 1e6); // the same bill
        vm.expectRevert(KibbleCore.BadBillRef.selector);
        d.buy(bytes32(0), 1e6);
        vm.expectRevert(KibbleCore.BadBillRef.selector);
        d.buy(keccak256("zero"), 0);
        vm.expectRevert(KibbleCore.BadBillRef.selector);
        d.ackDelivery(keccak256("never"));
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(KibbleCore.BadBillRef.selector);
        d.refund(keccak256("never"));
    }

    function test_pausedDrawer_takesNoOrders() public {
        KibbleDrawer d = earned();
        vm.prank(guardian);
        adm(d).freeze();
        vm.prank(buyer);
        vm.expectRevert(KibbleCore.Inactive.selector);
        d.buy(keccak256("late"), 1e6);
        vm.prank(owner);
        vm.expectRevert(KibbleCore.Inactive.selector);
        adm(d).fundAllowance(1);
    }

    function test_vault_errors() public {
        token.mint(address(vault), 5e6);
        vm.startPrank(owner);
        vm.expectRevert(KibbleVault.ZeroAddress.selector);
        vault.queueWithdraw(address(0), 1);
        vm.expectRevert(KibbleVault.UnknownWithdrawal.selector);
        vault.executeWithdraw(9);
        vm.expectRevert(KibbleVault.UnknownWithdrawal.selector);
        vault.cancelWithdraw(9);
        uint256 id = vault.queueWithdraw(attacker, 1e6);
        vm.expectRevert(KibbleVault.NotReady.selector);
        vault.executeWithdraw(id);
        vm.stopPrank();
        vm.prank(attacker);
        vm.expectRevert(KibbleVault.NotOwnerOrHome.selector);
        vault.cancelWithdraw(id);
        skip(1 days + 1);
        vm.startPrank(owner);
        vault.executeWithdraw(id);
        vm.expectRevert(KibbleVault.AlreadyDone.selector);
        vault.executeWithdraw(id);
        vm.expectRevert(KibbleVault.AlreadyDone.selector);
        vault.cancelWithdraw(id);
        vm.stopPrank();
        assertEq(vault.withdrawalCount(), 1);
        assertTrue(vault.withdrawal(id).done);
        assertEq(vault.balance(), 4e6);
    }
}
