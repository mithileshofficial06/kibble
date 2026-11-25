// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console2} from "forge-std/console2.sol";
import {KibbleBase} from "../KibbleBase.sol";
import {KibbleDrawer} from "../../src/KibbleDrawer.sol";
import {Mode, State, Config, Param, SupplierInit, AcceptorInit} from "../../src/KibbleTypes.sol";

/// A capable attacker: holds the stolen agent key, has money of their own, and secretly owns the approved
/// supplier (the worst case). Kibble gets no human help at all. The fixed side is well run: a limit sized to
/// real demand, a supplier cap, loss alerts, and a human who freezes it one window after the attack starts.
/// `forge test --match-contract KibbleAttacks -vv` prints the table in docs/attacks.md.
contract KibbleAttacksTest is KibbleBase {
    uint256 constant PRICE = 0.1e6;
    uint256 constant COST = 0.04e6;
    uint256 constant SALES = 12; // honest sales a window
    uint256 constant FIXED_LIMIT = 0.6e6; // 25% above what those sales cost
    uint256 constant ROUNDS = 20; // windows an attack may last
    uint256 honestSpend; // what the real business bought during the attack (not loot)
    bool strict; // Kibble with no slack and no stranger budget
    uint256 humanWindows; // fixed side: the owner freezes it this many windows after the attack starts

    struct Result {
        int256 ownerLoss; // what the owner's drawer and vault lost (negative: gained)
        int256 attackerNet; // what the attacker ended up with, after their own costs
        uint256 bound; // maxLossNow when the attack started
        State state;
    }

    function setUp() public override {
        super.setUp();
        token.mint(attacker, 10_000e6);
        token.mint(buyer, 10_000e6);
    }

    // ------------------------------------------------------------ the two sides

    function _drawer(Mode mode, uint32 learning) internal returns (KibbleDrawer d) {
        Config memory c = cfg(learning);
        c.incomeHold = 60;
        c.fixedLimit = mode == Mode.FIXED ? FIXED_LIMIT : 0;
        SupplierInit[] memory s = new SupplierInit[](1);
        s[0] = SupplierInit({payee: supplier, perPayment: 1e6, perWindow: mode == Mode.FIXED ? uint128(FIXED_LIMIT) : 0});
        vm.prank(owner);
        d = KibbleDrawer(factory.createDrawer(mode, agent, c, s, new AcceptorInit[](0), "sim"));
        vm.prank(owner);
        token.approve(address(d), type(uint256).max);
        vm.prank(buyer);
        token.approve(address(d), type(uint256).max);
        vm.prank(attacker);
        token.approve(address(d), type(uint256).max);
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
        if (strict && mode == Mode.EARNED) {
            vm.startPrank(owner);
            adm(d).tighten(Param.Slack, 0);
            adm(d).tighten(Param.UnknownBudget, 0);
            vm.stopPrank();
        }
    }

    function _honestWindow(KibbleDrawer d) internal {
        for (uint256 i; i < SALES; ++i) {
            bytes32 b = sell(d, PRICE);
            vm.prank(agent);
            if (d.pay(supplier, COST, bill())) honestSpend += COST;
            vm.prank(buyer);
            d.ackDelivery(b);
            vm.roll(block.number + 1);
        }
    }

    function _warm(Mode mode) internal returns (KibbleDrawer d) {
        d = _drawer(mode, mode == Mode.EARNED ? 5 : 0);
        for (uint256 w; w < 25; ++w) {
            _honestWindow(d);
            nextWindow(d);
        }
    }

    function _owned(KibbleDrawer d) internal view returns (uint256) {
        return token.balanceOf(address(vault)) + token.balanceOf(address(d));
    }

    /// Ask for as much as the drawer will pay the colluding supplier, in `chunk`s.
    function _grab(KibbleDrawer d, uint256 chunk, uint256 times) internal {
        for (uint256 i; i < times; ++i) {
            vm.prank(agent);
            if (!d.pay(supplier, chunk, bill())) break;
        }
    }

    function _fakeSale(KibbleDrawer d, uint256 amount) internal returns (bytes32 b) {
        b = bill();
        vm.prank(attacker);
        try d.buy(b, amount) {} catch {}
    }

    function _run(Mode mode, function(KibbleDrawer, uint256) internal attack, bool warm) internal returns (Result memory r) {
        KibbleDrawer d = warm ? _warm(mode) : _drawer(mode, mode == Mode.EARNED ? 5 : 0);
        r.bound = d.maxLossNow();
        uint256 owned = _owned(d);
        uint256 loot = token.balanceOf(supplier);
        uint256 cash = token.balanceOf(attacker);
        honestSpend = 0;
        for (uint256 w; w < ROUNDS; ++w) {
            attack(d, w);
            nextWindow(d);
            if (mode == Mode.FIXED && w + 1 == humanWindows) {
                vm.prank(owner);
                adm(d).freeze(); // the human saw the alert
            }
            if (d.state() >= State.Paused) break;
        }
        skip(120);
        vm.roll(block.number + 1);
        d.sync();
        r.ownerLoss = int256(owned) - int256(_owned(d));
        r.attackerNet =
            int256(token.balanceOf(supplier)) - int256(loot) + int256(token.balanceOf(attacker)) - int256(cash)
            - int256(honestSpend);
        r.state = d.state();
    }

    // ------------------------------------------------------------ the attacks

    function atkOverbuy(KibbleDrawer d, uint256) internal {
        for (uint256 i; i < 20; ++i) {
            vm.prank(agent);
            d.pay(supplier, 0.5e6, bill());
            skip(1);
        }
    }

    function atkFakeSaleRefund(KibbleDrawer d, uint256) internal {
        bytes32 b = _fakeSale(d, 30e6);
        _grab(d, 1e6, 12);
        _grab(d, 0.05e6, 40);
        vm.prank(agent);
        try d.refund(b) {} catch {}
    }

    function atkFakeSaleKept(KibbleDrawer d, uint256) internal {
        _fakeSale(d, 2e6);
        _grab(d, 0.5e6, 4);
        _grab(d, 0.05e6, 20);
    }

    function atkStranger(KibbleDrawer d, uint256) internal {
        for (uint256 i; i < 25; ++i) {
            vm.prank(agent);
            d.pay(attacker, 0.05e6, bill());
        }
    }

    /// Never spends more than the slack, so there is never a strike.
    function atkDrip(KibbleDrawer d, uint256) internal {
        vm.prank(agent);
        d.pay(supplier, 0.05e6, bill());
    }

    /// The business carries on; the attacker takes the room between its real cost and the ceiling.
    function atkSkim(KibbleDrawer d, uint256) internal {
        _honestWindow(d);
        for (uint256 i; i < 40; ++i) {
            uint256 room = d.mode() == Mode.EARNED ? d.ceilingRoom() : d.allowance();
            if (room < 0.01e6) break;
            vm.prank(agent);
            if (!d.pay(supplier, 0.01e6, bill())) break;
        }
    }

    /// Buys from itself to grow T, then grabs everything at once.
    function atkWashThenGrab(KibbleDrawer d, uint256 w) internal {
        if (w < ROUNDS - 1) {
            bytes32 b = _fakeSale(d, 3e6);
            vm.prank(attacker);
            try d.ackDelivery(b) {} catch {}
            uint256 room = d.mode() == Mode.EARNED ? d.ceilingRoom() : d.allowance();
            while (room >= 0.1e6) {
                uint256 a = room > 1e6 ? 1e6 : room;
                vm.prank(agent);
                if (!d.pay(supplier, a, bill())) break;
                room -= a;
            }
        } else {
            _grab(d, 1e6, 20);
        }
    }

    /// Takes a rush of real orders, spends against them, and never delivers.
    function atkTakeOrdersAndRun(KibbleDrawer d, uint256 w) internal {
        if (w == 0) for (uint256 i; i < 100; ++i) sell(d, PRICE);
        _grab(d, 1e6, 12);
        _grab(d, 0.05e6, 40);
    }

    // ------------------------------------------------------------ the table

    function _s(int256 v) internal pure returns (string memory) {
        uint256 a = uint256(v < 0 ? -v : v);
        uint256 frac = (a % 1e6) / 1e3;
        string memory f = frac < 10 ? "00" : frac < 100 ? "0" : "";
        return string.concat(v < 0 ? "-" : "", vm.toString(a / 1e6), ".", f, vm.toString(frac));
    }

    function _name(State s) internal pure returns (string memory) {
        if (s == State.Learning) return "Learning";
        if (s == State.Healthy) return "Healthy";
        if (s == State.Watch) return "Watch";
        if (s == State.Braked) return "Braked";
        return "Paused";
    }

    function _row(string memory label, function(KibbleDrawer, uint256) internal attack, bool warm, bool customersPay)
        internal
    {
        uint256 snap = vm.snapshotState();
        humanWindows = 1;
        Result memory f = _run(Mode.FIXED, attack, warm);
        vm.revertToState(snap);
        snap = vm.snapshotState();
        humanWindows = 5;
        Result memory g = _run(Mode.FIXED, attack, warm);
        vm.revertToState(snap);
        snap = vm.snapshotState();
        Result memory k = _run(Mode.EARNED, attack, warm);
        vm.revertToState(snap);
        console2.log(
            string.concat(
                string.concat("ROW| ", label, " | ", _s(f.attackerNet), " | ", _s(g.attackerNet), " | "),
                string.concat(_s(k.attackerNet), " | ", _s(k.ownerLoss), " | ", _s(int256(k.bound))),
                string.concat(" | ", _name(k.state), " |")
            )
        );
        // The promise: no attack costs the owner more than what maxLossNow showed when it started, unless
        // value keeps arriving (the skim), which refills the allowance.
        if (!customersPay) {
            assertLe(k.ownerLoss, int256(k.bound), label);
            assertLe(k.attackerNet, int256(k.bound), label);
        }
    }

    function test_attacks_overbuy() public {
        _row("Overbuy flat out", atkOverbuy, true, false);
    }

    function test_attacks_fakeSaleRefund() public {
        _row("Fake sale, overspend, refund it", atkFakeSaleRefund, true, false);
    }

    function test_attacks_fakeSaleKept() public {
        _row("Fake sales, never refunded", atkFakeSaleKept, true, false);
    }

    function test_attacks_stranger() public {
        _row("Pay the attacker directly", atkStranger, true, false);
    }

    /// The owner can close these two with one setting each; they cost an agent with no sales its first purchase.
    function test_attacks_strict() public {
        strict = true;
        _row("Slow drip, strict", atkDrip, true, false);
        _row("Pay the attacker directly, strict", atkStranger, true, false);
    }

    function test_attacks_strictSkim() public {
        strict = true;
        _row("Skim, strict", atkSkim, true, true);
    }

    function test_attacks_strictOverbuy() public {
        strict = true;
        _row("Overbuy, strict", atkOverbuy, true, false);
    }

    function test_attacks_drip() public {
        _row("Slow drip inside the slack", atkDrip, true, false);
    }

    function test_attacks_skim() public {
        _row("Skim while business goes on", atkSkim, true, true);
    }

    function test_attacks_washThenGrab() public {
        _row("Wash sales to grow T, then grab", atkWashThenGrab, true, false);
    }

    function test_attacks_takeOrdersAndRun() public {
        _row("Take real orders, spend, vanish", atkTakeOrdersAndRun, true, true);
    }

    function test_attacks_whileLearning() public {
        _row("Overbuy in the learning period", atkOverbuy, false, false);
    }
}
