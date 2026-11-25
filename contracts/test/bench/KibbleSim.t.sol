// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console2} from "forge-std/console2.sol";
import {KibbleBase} from "../KibbleBase.sol";
import {KibbleDrawer} from "../../src/KibbleDrawer.sol";
import {Mode, State, Config, SupplierInit, AcceptorInit} from "../../src/KibbleTypes.sol";

/// 120 simulated agents through the real contracts, the same demand for every policy. `make sim` prints the
/// numbers in docs/simulation.md. The agents, prices and demand are made up; the contracts are not.
contract KibbleSimTest is KibbleBase {
    uint256 constant AGENTS = 120;
    uint256 constant WINDOWS = 25;
    uint256 constant PRICE = 0.1e6;
    uint256 constant NEVER = type(uint256).max;

    struct Plan {
        uint256 cost; // what one sale's input costs
        uint256 demand0; // sales in window 0
        uint256 growthBps; // demand growth a window
        uint256 badFrom; // the input price jumps above the sale price from this window
        uint256 hijackAt; // the key is stolen in this window
    }

    struct Tally {
        uint256 served;
        uint256 turned;
        uint256 stolen; // taken by attackers
        uint256 badLoss; // value minus spend after a price jump, when negative
        int256 ownerNet; // vault plus drawer, minus what the owner put in
        uint256 stuck; // customers the agent key could not refund (the owner can)
        uint256 refusing; // bad or hijacked agents that ended Watch or Braked
        uint256 stopped; // bad or hijacked agents that ended paused or frozen
    }

    enum Policy {
        KIBBLE, // nobody ever steps in
        FIXED_TIGHT, // 25% above launch demand; a human freezes it after two bad windows
        FIXED_ROOMY // enough for peak demand; the same human
    }

    function setUp() public override {
        super.setUp();
        token.mint(owner, 1e15);
        token.mint(buyer, 1e15);
    }

    function _r(uint256 seed, string memory k, uint256 lo, uint256 hi) internal pure returns (uint256) {
        return lo + uint256(keccak256(abi.encode(seed, k))) % (hi - lo + 1);
    }

    function _plan(uint256 i) internal pure returns (Plan memory p) {
        uint256 kind = _r(i, "kind", 0, 99);
        // 60 in 100 healthy, 20 thin margins, 20 turn bad
        p.cost = (PRICE * (kind < 60 || kind >= 80 ? _r(i, "cost", 25, 60) : _r(i, "cost", 75, 88))) / 100;
        p.badFrom = kind >= 80 ? _r(i, "bad", 8, 18) : NEVER;
        p.demand0 = _r(i, "demand", 4, 8);
        p.growthBps = _r(i, "growth", 0, 600);
        p.hijackAt = _r(i, "hijacked", 0, 99) < 15 ? _r(i, "hijackAt", 8, 20) : NEVER;
    }

    function _demand(Plan memory p, uint256 i, uint256 w) internal pure returns (uint256) {
        uint256 base = p.demand0 + (p.demand0 * p.growthBps * w) / 10_000;
        return (base * _r(uint256(keccak256(abi.encode(i, w))), "noise", 80, 120)) / 100;
    }

    function _make(Plan memory p, Policy pol) internal returns (KibbleDrawer d) {
        Config memory c = cfg(pol == Policy.KIBBLE ? 5 : 0);
        c.incomeHold = 60;
        uint256 peak = p.demand0 + (p.demand0 * p.growthBps * WINDOWS) / 10_000;
        if (pol == Policy.FIXED_TIGHT) c.fixedLimit = (p.demand0 * p.cost * 125) / 100;
        if (pol == Policy.FIXED_ROOMY) c.fixedLimit = (peak * p.cost * 125) / 100;
        SupplierInit[] memory s = new SupplierInit[](1);
        s[0] = SupplierInit({payee: supplier, perPayment: 1e6, perWindow: 0});
        vm.prank(owner);
        d = KibbleDrawer(factory.createDrawer(pol == Policy.KIBBLE ? Mode.EARNED : Mode.FIXED, agent, c, s, new AcceptorInit[](0), "sim"));
        vm.prank(owner);
        token.approve(address(d), type(uint256).max);
        vm.prank(buyer);
        token.approve(address(d), type(uint256).max);
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
    }

    function _run(uint256 i, Policy pol, Tally memory t) internal {
        Plan memory p = _plan(i);
        KibbleDrawer d = _make(p, pol);
        uint256 vault0 = token.balanceOf(address(vault));
        uint256 badWindows;
        for (uint256 w; w < WINDOWS; ++w) {
            uint256 v0 = d.lifetimeValue();
            uint256 s0 = d.lifetimeSpend();
            if (w >= p.hijackAt) {
                for (uint256 k; k < 20; ++k) {
                    vm.prank(agent);
                    if (d.pay(supplier, 0.25e6, bill())) t.stolen += 0.25e6;
                    skip(1);
                }
                // the last of it, in small change
                for (uint256 k; k < 10; ++k) {
                    vm.prank(agent);
                    if (d.pay(supplier, 0.05e6, bill())) t.stolen += 0.05e6;
                }
            } else {
                uint256 cost = w >= p.badFrom ? (PRICE * 130) / 100 : p.cost;
                uint256 n = _demand(p, i, w);
                for (uint256 k; k < n; ++k) {
                    if (d.state() >= State.Paused) {
                        ++t.turned;
                        continue;
                    }
                    bytes32 b = sell(d, PRICE);
                    vm.prank(agent);
                    if (d.pay(supplier, cost, bill())) {
                        vm.prank(buyer);
                        d.ackDelivery(b);
                        ++t.served;
                    } else {
                        vm.prank(agent);
                        try d.refund(b) {}
                        catch {
                            ++t.stuck;
                        }
                        ++t.turned;
                    }
                    vm.roll(block.number + 1);
                }
            }
            uint256 v = d.lifetimeValue() - v0;
            uint256 s = d.lifetimeSpend() - s0;
            if (s > v) {
                ++badWindows;
                if (w >= p.badFrom && w < p.hijackAt) t.badLoss += s - v;
            }
            nextWindow(d);
            // the human on the fixed side reads the alerts and freezes it after the second bad window
            if (pol != Policy.KIBBLE && badWindows >= 2 && d.state() < State.Paused) {
                vm.prank(owner);
                adm(d).freeze();
            }
        }
        if ((p.badFrom != NEVER || p.hijackAt != NEVER) && d.state() >= State.Paused) ++t.stopped;
        if ((p.badFrom != NEVER || p.hijackAt != NEVER) && (d.state() == State.Watch || d.state() == State.Braked)) ++t.refusing;
        skip(120);
        d.sync();
        t.ownerNet += int256(token.balanceOf(address(vault)) - vault0 + token.balanceOf(address(d))) - 2e6;
    }

    function _f(uint256 v) internal pure returns (string memory) {
        uint256 frac = (v % 1e6) / 1e4;
        return string.concat(vm.toString(v / 1e6), ".", frac < 10 ? "0" : "", vm.toString(frac));
    }

    function test_sim() public {
        uint256 bad;
        uint256 hijacked;
        for (uint256 i; i < AGENTS; ++i) {
            Plan memory p = _plan(i);
            if (p.badFrom != NEVER) ++bad;
            if (p.hijackAt != NEVER) ++hijacked;
        }
        console2.log("agents", AGENTS);
        console2.log("turn bad", bad);
        console2.log("hijacked", hijacked);
        string[3] memory names = ["Kibble, no human", "Fixed, tight", "Fixed, roomy"];
        for (uint256 pol; pol < 3; ++pol) {
            Tally memory t;
            for (uint256 i; i < AGENTS; ++i) {
                uint256 snap = vm.snapshotState();
                _run(i, Policy(pol), t);
                vm.revertToStateAndDelete(snap);
            }
            string memory net = t.ownerNet < 0 ? string.concat("-", _f(uint256(-t.ownerNet))) : _f(uint256(t.ownerNet));
            console2.log(
                string.concat(
                    string.concat("ROW| ", names[pol], " | ", vm.toString(t.served), " | ", vm.toString(t.turned), " | "),
                    string.concat(_f(t.stolen), " | ", _f(t.badLoss), " | ", net, " | "),
                    string.concat(vm.toString(t.stopped), " | ", vm.toString(t.refusing), " | ", vm.toString(t.stuck), " |")
                )
            );
        }
    }
}
