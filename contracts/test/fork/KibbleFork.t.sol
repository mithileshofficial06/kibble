// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KibbleAdmin} from "../../src/KibbleAdmin.sol";
import {KibbleDrawer} from "../../src/KibbleDrawer.sol";
import {KibbleFactory} from "../../src/KibbleFactory.sol";
import {KibbleVault} from "../../src/KibbleVault.sol";
import {Mode, State, Config, SupplierInit, AcceptorInit} from "../../src/KibbleTypes.sol";
import {Signing} from "../Signing.sol";

interface ITUSD8 is IERC20 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice Kibble against the REAL tUSD8 on a local fork of Aevum testnet (`make test-fork`).
contract KibbleForkTest is Test {
    ITUSD8 constant TUSD8 = ITUSD8(0x456569838f1d43009A91ebA4263147Afd7233483);

    KibbleFactory factory;
    KibbleVault vault;
    KibbleDrawer d;
    address owner = makeAddr("owner");
    address guardian = makeAddr("guardian");
    address agent = makeAddr("agent");
    address supplier = makeAddr("supplier");
    address buyer;
    uint256 buyerKey;

    function setUp() public {
        assertEq(block.chainid, 44005, "run with --fork-url aevum");
        (buyer, buyerKey) = makeAddrAndKey("buyer");
        factory = new KibbleFactory(TUSD8, address(new KibbleDrawer(address(new KibbleAdmin()))));
        vm.prank(owner);
        vault = KibbleVault(factory.createVault(guardian, 1 days));

        Config memory c = factory.demoConfig(20e6);
        c.learningWindows = 0;
        SupplierInit[] memory s = new SupplierInit[](1);
        s[0] = SupplierInit({payee: supplier, perPayment: 1e6, perWindow: 0});
        vm.prank(owner);
        d = KibbleDrawer(factory.createDrawer(Mode.EARNED, agent, c, s, new AcceptorInit[](0), "fork"));

        deal(address(TUSD8), owner, 100e6);
        deal(address(TUSD8), buyer, 100e6);
        vm.prank(owner);
        TUSD8.approve(address(d), type(uint256).max);
        vm.prank(owner);
        KibbleAdmin(address(d)).fundAllowance(2e6);
    }

    function test_fork_saleBuyAckSweep_realTusd8() public {
        bytes32 bill = keccak256("fork-sale");
        vm.startPrank(buyer);
        TUSD8.approve(address(d), 1e6);
        d.buy(bill, 1e6);
        vm.stopPrank();

        vm.prank(agent);
        assertTrue(d.pay(supplier, 0.4e6, bill));
        assertEq(TUSD8.balanceOf(supplier), 0.4e6);

        vm.prank(buyer);
        d.ackDelivery(bill);
        assertEq(d.allowance(), 2e6, "refilled to T");
        assertEq(TUSD8.balanceOf(address(vault)), 0.6e6, "profit swept to the vault");
        assertEq(TUSD8.balanceOf(address(d)), 2e6);
    }

    function test_fork_gaslessBuy_eip3009_realTusd8() public {
        bytes32 bill = keccak256("fork-gasless");
        Signing.Auth memory a = Signing.Auth({
            from: buyer,
            to: address(d),
            value: 0.1e6,
            validAfter: 0,
            validBefore: block.timestamp + 1 hours,
            nonce: d.saleNonce(bill)
        });
        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(vm, buyerKey, TUSD8.DOMAIN_SEPARATOR(), a);
        vm.prank(makeAddr("relayer"));
        d.buyWithAuthorization(bill, buyer, 0.1e6, 0, a.validBefore, v, r, s);
        assertEq(d.pendingTotal(), 0.1e6);
    }

    function test_fork_hijackPausesWithRealToken() public {
        for (uint256 i; i < 3; ++i) {
            vm.prank(agent);
            assertFalse(d.pay(supplier, 0.6e6, keccak256(abi.encode(i))));
            skip(5);
        }
        assertEq(uint8(d.state()), uint8(State.Paused));
        assertEq(d.maxLossNow(), 0);
    }
}
