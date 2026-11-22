// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {KibbleAdmin} from "../src/KibbleAdmin.sol";
import {KibbleVault} from "../src/KibbleVault.sol";
import {KibbleFactory} from "../src/KibbleFactory.sol";
import {Mode, State, Reason, Config, SupplierInit, AcceptorInit} from "../src/KibbleTypes.sol";

/// Shared fixture: MockUSD8, factory, one owner vault, helpers to sell, buy, sign and move time.
abstract contract KibbleBase is Test {
    MockUSD8 token;
    KibbleFactory factory;
    KibbleVault vault;

    uint256 ownerPk = 0xA11CE;
    uint256 guardianPk = 0xB0B;
    uint256 acceptorPk = 0xACC;
    uint256 buyerPk = 0xB1;
    address owner;
    address guardian;
    address acceptor;
    address buyer;
    address agent = makeAddr("agent");
    address supplier = makeAddr("supplier");
    address supplier2 = makeAddr("supplier2");
    address attacker = makeAddr("attacker");

    uint256 constant L = 20e6; // maxWeeklyLoss: Tmax 10, Tstart 2, approval threshold 2

    function setUp() public virtual {
        owner = vm.addr(ownerPk);
        guardian = vm.addr(guardianPk);
        acceptor = vm.addr(acceptorPk);
        buyer = vm.addr(buyerPk);
        vm.warp(1_700_000_000);

        token = new MockUSD8();
        KibbleAdmin adminModule = new KibbleAdmin();
        KibbleDrawer impl = new KibbleDrawer(address(adminModule));
        factory = new KibbleFactory(token, address(impl));

        vm.prank(owner);
        vault = KibbleVault(factory.createVault(guardian, 1 days));

        token.mint(owner, 1_000e6);
        token.mint(buyer, 1_000e6);
    }

    // ------------------------------------------------------------ deploy

    function cfg(uint32 learning) internal view returns (Config memory c) {
        c = factory.demoConfig(L);
        c.learningWindows = learning;
    }

    function newDrawer(Mode mode, Config memory c) internal returns (KibbleDrawer d) {
        SupplierInit[] memory s = new SupplierInit[](1);
        s[0] = SupplierInit({payee: supplier, perPayment: 1e6, perWindow: 0});
        AcceptorInit[] memory a = new AcceptorInit[](1);
        a[0] = AcceptorInit({acceptor: acceptor, perWindow: 5e6});
        vm.prank(owner);
        d = KibbleDrawer(factory.createDrawer(mode, agent, c, s, a, "test"));
        vm.prank(owner);
        token.approve(address(d), type(uint256).max);
        vm.prank(buyer);
        token.approve(address(d), type(uint256).max);
    }

    /// Earned-mode drawer, already Healthy (no learning), seeded with T = 2.
    function earned() internal returns (KibbleDrawer d) {
        d = newDrawer(Mode.EARNED, cfg(0));
        vm.prank(owner);
        adm(d).fundAllowance(2e6);
    }

    function fixedDrawer(uint256 limit) internal returns (KibbleDrawer d) {
        Config memory c = cfg(0);
        c.fixedLimit = limit;
        d = newDrawer(Mode.FIXED, c);
        vm.prank(owner);
        adm(d).fundAllowance(30e6);
    }

    function adm(KibbleDrawer d) internal pure returns (KibbleAdmin) {
        return KibbleAdmin(address(d));
    }

    // ------------------------------------------------------------ actions

    uint256 billSeq;

    function bill() internal returns (bytes32) {
        return keccak256(abi.encode("bill", ++billSeq));
    }

    function sell(KibbleDrawer d, uint256 amount) internal returns (bytes32 b) {
        b = bill();
        vm.prank(buyer);
        d.buy(b, amount);
    }

    function payS(KibbleDrawer d, uint256 amount) internal returns (bool) {
        vm.prank(agent);
        return d.pay(supplier, amount, bill());
    }

    function clearHold(KibbleDrawer d) internal {
        skip(d.incomeHold() + 1);
        vm.roll(block.number + 1);
        d.sync();
    }

    /// Move to the start of the next window and close the current one.
    function nextWindow(KibbleDrawer d) internal {
        uint256 endsAt = d.windowStart() + d.windowLength();
        if (block.timestamp < endsAt) vm.warp(endsAt);
        vm.roll(block.number + 1);
        d.sync();
    }

    // ------------------------------------------------------------ signing

    function domain(KibbleDrawer d) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Kibble Drawer"),
                keccak256("1"),
                block.chainid,
                address(d)
            )
        );
    }

    function sign712(uint256 pk, KibbleDrawer d, bytes32 structHash) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain(d), structHash)));
        return abi.encodePacked(r, s, v);
    }

    function signWork(uint256 pk, KibbleDrawer d, bytes32 jobId, uint256 value, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return sign712(pk, d, keccak256(abi.encode(d.WORK_TYPEHASH(), jobId, value, deadline)));
    }

    function signApproval(KibbleDrawer d, address payee, uint256 amount, bytes32 billRef, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return sign712(
            ownerPk,
            d,
            keccak256(abi.encode(d.PAY_APPROVAL_TYPEHASH(), payee, amount, billRef, deadline, d.approvalNonce()))
        );
    }

    function signResume(uint256 pk, KibbleDrawer d, uint256 deadline) internal view returns (bytes memory) {
        return sign712(pk, d, keccak256(abi.encode(d.RESUME_TYPEHASH(), d.resumeNonce(), deadline)));
    }

    /// Token balance always equals the sum of the drawer's buckets between calls.
    function assertBuckets(KibbleDrawer d) internal view {
        assertEq(
            token.balanceOf(address(d)),
            d.allowance() + d.pendingTotal() + d.workBudget() + d.runway() + d.reserve(),
            "buckets != balance"
        );
    }
}
