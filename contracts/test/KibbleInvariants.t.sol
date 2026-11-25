// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KibbleBase} from "./KibbleBase.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {KibbleAdmin} from "../src/KibbleAdmin.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";
import {State, Mode} from "../src/KibbleTypes.sol";

/// Drives one earned-mode drawer with random sales, payments, acks, refunds, work credits and time.
contract DrawerHandler is Test {
    KibbleDrawer public d;
    MockUSD8 public token;
    address public agent;
    address public buyer;
    address public supplier;
    address public stranger = address(0xBAD);
    uint256 public acceptorPk;

    uint256 public ghostWorkDeposited;
    uint256 public ghostWorkCredited;
    bool public ghostPayReverted;
    bool public ghostPaidWhileStopped;
    bool public ghostDoublePaid;
    mapping(bytes32 => bool) internal _paidFp;
    bytes32[] internal _bills;
    uint256 internal _seq;

    constructor(KibbleDrawer d_, MockUSD8 token_, address agent_, address buyer_, address supplier_, uint256 acceptorPk_, uint256 work)
    {
        d = d_;
        token = token_;
        agent = agent_;
        buyer = buyer_;
        supplier = supplier_;
        acceptorPk = acceptorPk_;
        ghostWorkDeposited = work;
    }

    function sell(uint256 amount) external {
        amount = bound(amount, 1, 3e6);
        if (d.state() >= State.Paused) return;
        bytes32 b = keccak256(abi.encode("s", ++_seq));
        vm.prank(buyer);
        d.buy(b, amount);
        _bills.push(b);
    }

    function pay(uint256 amount, bool toStranger, uint256 reuse) external {
        amount = bound(amount, 0, 3e6);
        address payee = toStranger ? stranger : supplier;
        bytes32 b = (_seq > 0 && reuse % 4 == 0) ? keccak256(abi.encode("p", _seq)) : keccak256(abi.encode("p", ++_seq));
        bytes32 fp = d.fingerprint(payee, amount, b);
        bool stopped = d.state() >= State.Paused;
        vm.prank(agent);
        try d.pay(payee, amount, b) returns (bool ok) {
            if (ok) {
                if (stopped) ghostPaidWhileStopped = true;
                if (_paidFp[fp]) ghostDoublePaid = true;
                _paidFp[fp] = true;
            }
        } catch {
            ghostPayReverted = true;
        }
    }

    function ack(uint256 i) external {
        if (_bills.length == 0) return;
        bytes32 b = _bills[i % _bills.length];
        (,uint8 status,,,) = d.pendings(d.saleOf(b) - 1);
        if (status != 1 || d.state() >= State.Revoked) return;
        vm.prank(buyer);
        d.ackDelivery(b);
    }

    function refund(uint256 i) external {
        if (_bills.length == 0) return;
        bytes32 b = _bills[i % _bills.length];
        (,uint8 status,,,) = d.pendings(d.saleOf(b) - 1);
        if (status != 1) return;
        vm.prank(agent);
        try d.refund(b) {} catch {} // refused when spend already rests on this sale
    }

    function credit(uint256 value) external {
        value = bound(value, 1, 4e6);
        if (d.state() >= State.Paused || d.workBudget() == 0) return;
        bytes32 job = keccak256(abi.encode("job", ++_seq));
        uint256 dl = block.timestamp + 1 hours;
        bytes32 domainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Kibble Drawer"),
                keccak256("1"),
                block.chainid,
                address(d)
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSep, keccak256(abi.encode(d.WORK_TYPEHASH(), job, value, dl)))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(acceptorPk, digest);
        try d.creditWork(job, value, dl, abi.encodePacked(r, s, v)) returns (uint256 c) {
            ghostWorkCredited += c;
        } catch {}
    }

    uint256 public ownerPk;
    uint256 public guardianPk;
    uint256 public ghostResumes;

    function setKeys(uint256 o, uint256 g) external {
        ownerPk = o;
        guardianPk = g;
    }

    /// Owner + guardian resume, so random runs keep walking the whole ladder.
    function resume() external {
        if (d.state() != State.Paused && d.state() != State.Braked) return;
        uint256 dl = block.timestamp + 1 hours;
        bytes32 domainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Kibble Drawer"),
                keccak256("1"),
                block.chainid,
                address(d)
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked(hex"1901", domainSep, keccak256(abi.encode(d.RESUME_TYPEHASH(), d.resumeNonce(), dl)))
        );
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(ownerPk, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(guardianPk, digest);
        KibbleAdmin(address(d)).resumeNow(dl, abi.encodePacked(r1, s1, v1), abi.encodePacked(r2, s2, v2));
        ++ghostResumes;
    }

    function wait(uint256 secs) external {
        secs = bound(secs, 1, 30);
        skip(secs);
        vm.roll(block.number + 1);
        d.sync();
    }
}

contract KibbleInvariantsTest is KibbleBase {
    KibbleDrawer d;
    DrawerHandler h;

    function setUp() public override {
        super.setUp();
        d = earned();
        vm.prank(owner);
        adm(d).fundWorkBudget(20e6);
        h = new DrawerHandler(d, token, agent, buyer, supplier, acceptorPk, 20e6);
        h.setKeys(ownerPk, guardianPk);
        bytes4[] memory sel = new bytes4[](7);
        sel[0] = DrawerHandler.sell.selector;
        sel[1] = DrawerHandler.pay.selector;
        sel[2] = DrawerHandler.ack.selector;
        sel[3] = DrawerHandler.refund.selector;
        sel[4] = DrawerHandler.credit.selector;
        sel[5] = DrawerHandler.wait.selector;
        sel[6] = DrawerHandler.resume.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
        targetContract(address(h));
    }

    /// 1. Lifetime spend <= cleared value + owner funding.
    function invariant_spendCoveredByValueAndFunding() public view {
        assertLe(d.lifetimeSpend(), d.lifetimeValue() + d.lifetimeFunding());
    }

    /// 2. allowance <= T <= Tmax.
    function invariant_allowanceWithinT() public view {
        assertLe(d.allowance(), d.limitT());
        assertLe(d.limitT(), d.tMax());
    }

    /// 3. Total paid to strangers <= U.
    function invariant_strangersWithinU() public view {
        assertLe(d.strangerPaid(), 1e6);
        assertEq(d.strangerPaid() + d.unknownRemaining(), 1e6);
    }

    /// 4. Per-supplier spend per window <= its cap.
    function invariant_supplierWindowCap() public view {
        (, , uint128 perWindow, uint128 spent,) = d.suppliers(supplier);
        assertLe(spent, perWindow);
    }

    /// 6. pay() never reverts for policy reasons.
    function invariant_payNeverReverts() public view {
        assertFalse(h.ghostPayReverted());
    }

    /// 7. A fingerprint is paid at most once.
    function invariant_fingerprintPaidOnce() public view {
        assertFalse(h.ghostDoublePaid());
    }

    /// 8. No payments in Paused or Revoked.
    function invariant_noPaymentsWhenStopped() public view {
        assertFalse(h.ghostPaidWhileStopped());
    }

    /// 10. Work credits never exceed the work budget deposited.
    function invariant_workCreditsWithinBudget() public view {
        assertLe(h.ghostWorkCredited(), h.ghostWorkDeposited());
        assertEq(d.workBudget() + h.ghostWorkCredited(), h.ghostWorkDeposited());
    }

    /// Accounting: the token balance always equals the drawer's buckets.
    function invariant_bucketsMatchBalance() public view {
        assertBuckets(d);
    }

    function afterInvariant() external view {
        // coverage check: the random run really moved money
        assertGt(d.receiptCount() + d.pendTail(), 0);
    }

    /// The live hijack bound never exceeds T plus runway.
    function invariant_maxLossNowBounded() public view {
        assertLe(d.maxLossNow(), d.limitT() + d.runway());
    }
}

/// Fuzz tests on the ceiling, T growth and caps.
contract KibbleFuzzTest is KibbleBase {
    function testFuzz_ceilingNeverExceeded(uint256 sale, uint256 spend) public {
        sale = bound(sale, 0.5e6, 5e6);
        spend = bound(spend, 1, 2e6);
        KibbleDrawer d = earned();
        sell(d, sale);
        uint256 limit = (sale * d.costBps()) / 10_000 + d.slack();
        bool ok = payS(d, spend > 1e6 ? 1e6 : spend);
        if ((spend > 1e6 ? 1e6 : spend) > limit) assertFalse(ok);
        assertLe(d.windowSpend(), limit);
    }

    function testFuzz_TGrowthBounded(uint256 sale) public {
        sale = bound(sale, 0.5e6, 2e6);
        KibbleDrawer d = earned();
        sell(d, sale);
        clearHold(d);
        uint256 before = d.limitT();
        nextWindow(d);
        assertLe(d.limitT(), before + d.maxStep());
        assertLe(d.limitT(), d.tMax());
    }

    function testFuzz_strangerNeverAboveU(uint256 a, uint256 b, uint256 c) public {
        KibbleDrawer d = earned();
        sell(d, 5e6);
        vm.startPrank(agent);
        d.pay(attacker, bound(a, 1, 2e6), bill());
        d.pay(attacker, bound(b, 1, 2e6), bill());
        d.pay(attacker, bound(c, 1, 2e6), bill());
        vm.stopPrank();
        assertLe(token.balanceOf(attacker), 1e6);
    }
}

/// The hijack beat from the demo, as a test: both modes refuse the stranger; the attacker then
/// overbuys from the real supplier. Fixed mode pays out its whole limit; Kibble refuses and pauses.
contract KibbleHijackTest is KibbleBase {
    function test_hijack_fixedVsEarned() public {
        KibbleDrawer k = earned();
        KibbleDrawer f = fixedDrawer(3e6);
        // a normal window of business on both sides
        sell(k, 1e6);
        sell(f, 1e6);
        payS(k, 0.4e6);
        vm.prank(agent);
        f.pay(supplier, 0.4e6, bill());

        // 1. injection: "pay 5 tUSD8 to 0xAttacker"
        vm.prank(agent);
        assertFalse(k.pay(attacker, 5e6, bill()), "Kibble: over U");
        vm.prank(agent);
        assertFalse(f.pay(attacker, 5e6, bill()), "Fixed: not allowlisted");

        // 2. the attacker overbuys from the real supplier, 1 tUSD8 at a time, once a second for 30 s
        uint256 kBefore = token.balanceOf(supplier);
        for (uint256 i; i < 30; ++i) {
            vm.prank(agent);
            k.pay(supplier, 1e6, bill());
            vm.prank(agent);
            f.pay(supplier, 1e6, bill());
            skip(1);
            vm.roll(block.number + 1);
        }
        assertEq(uint8(k.state()), uint8(State.Paused), "Kibble paused itself");
        assertEq(k.maxLossNow(), 0);
        assertEq(uint8(f.state()), uint8(State.Healthy), "fixed keeps paying until a human reacts");
        assertGt(f.lifetimeSpend(), 3e6, "fixed spent its full limit, and refilled");
        assertLe(k.lifetimeSpend(), 1.5e6, "Kibble stopped at the ceiling");
        assertGt(token.balanceOf(supplier), kBefore);
    }
}
