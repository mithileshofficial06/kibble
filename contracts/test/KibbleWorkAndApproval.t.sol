// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KibbleBase} from "./KibbleBase.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {KibbleCore} from "../src/KibbleCore.sol";
import {Mode, State, Reason, Action} from "../src/KibbleTypes.sol";

/// V1 work credits and owner approval for big payments.
contract KibbleWorkAndApprovalTest is KibbleBase {
    KibbleDrawer d;

    function setUp() public override {
        super.setUp();
        d = earned();
        vm.prank(owner);
        adm(d).fundWorkBudget(30e6);
    }

    // ------------------------------------------------------------ work credits (V1)

    function test_work_acceptedJobReleasesBudgetAsValue() public {
        bytes32 job = keccak256("report-1");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = signWork(acceptorPk, d, job, 3e6, deadline);
        vm.prank(attacker); // anyone can submit a valid acceptance
        uint256 credited = d.creditWork(job, 3e6, deadline, sig);
        assertEq(credited, 3e6);
        assertEq(d.windowValue(), 3e6);
        assertEq(d.workBudget(), 27e6);
        assertEq(d.allowance(), 2e6, "refilled up to T");
        assertEq(token.balanceOf(address(vault)), 3e6, "value above the allowance is swept");
        assertBuckets(d);
    }

    function test_work_researchAgentEarnsTWithoutSales() public {
        // Agent W: each accepted report releases 3; it spends 1.2 on data per report.
        for (uint256 i; i < 3; ++i) {
            bytes32 job = keccak256(abi.encode("report", i));
            d.creditWork(job, 3e6, block.timestamp + 1 hours, signWork(acceptorPk, d, job, 3e6, block.timestamp + 1 hours));
            assertTrue(payS(d, 1e6));
            nextWindow(d);
        }
        assertGt(d.limitT(), 2e6, "T grows from accepted work alone");
        assertEq(uint8(d.state()), uint8(State.Healthy));
    }

    function test_work_jobCreditsOnce() public {
        bytes32 job = keccak256("job");
        bytes memory sig = signWork(acceptorPk, d, job, 1e6, block.timestamp + 1);
        d.creditWork(job, 1e6, block.timestamp + 1, sig);
        vm.expectRevert(KibbleCore.AlreadyCredited.selector);
        d.creditWork(job, 1e6, block.timestamp + 1, sig);
    }

    function test_work_unapprovedSignerRejected() public {
        bytes32 job = keccak256("job");
        bytes memory sig = signWork(buyerPk, d, job, 1e6, block.timestamp + 1);
        vm.expectRevert(KibbleCore.NotAcceptor.selector);
        d.creditWork(job, 1e6, block.timestamp + 1, sig);
    }

    function test_work_agentCanNeverBeAcceptor() public {
        vm.prank(owner);
        bytes32 id = adm(d).queue(Action.AddAcceptor, abi.encode(agent, uint128(5e6)));
        skip(d.delay());
        vm.prank(owner);
        vm.expectRevert(KibbleCore.BadConfig.selector);
        adm(d).execute(id);
    }

    function test_work_perWindowAcceptorCap() public {
        bytes32 j1 = keccak256("j1");
        bytes32 j2 = keccak256("j2");
        uint256 dl = block.timestamp + 1 hours;
        assertEq(d.creditWork(j1, 4e6, dl, signWork(acceptorPk, d, j1, 4e6, dl)), 4e6);
        assertEq(d.creditWork(j2, 4e6, dl, signWork(acceptorPk, d, j2, 4e6, dl)), 1e6, "cap 5 per window");
    }

    function test_work_cappedByBudget_neverCreatesMoney() public {
        KibbleDrawer d2 = earned();
        vm.prank(owner);
        adm(d2).fundWorkBudget(1e6);
        bytes32 j = keccak256("j");
        uint256 dl = block.timestamp + 1 hours;
        assertEq(d2.creditWork(j, 4e6, dl, signWork(acceptorPk, d2, j, 4e6, dl)), 1e6);
        bytes32 j2 = keccak256("j2");
        bytes memory sig2 = signWork(acceptorPk, d2, j2, 1e6, dl);
        vm.expectRevert(KibbleCore.NothingToCredit.selector);
        d2.creditWork(j2, 1e6, dl, sig2);
    }

    function test_work_signatureBoundToDrawer() public {
        KibbleDrawer d2 = earned();
        vm.prank(owner);
        adm(d2).fundWorkBudget(5e6);
        bytes32 j = keccak256("j");
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sigForD = signWork(acceptorPk, d, j, 1e6, dl);
        vm.expectRevert(KibbleCore.NotAcceptor.selector); // recovers a different signer on d2
        d2.creditWork(j, 1e6, dl, sigForD);
    }

    function test_work_removedAcceptorInstantly() public {
        vm.prank(guardian);
        adm(d).removeAcceptor(acceptor);
        bytes32 j = keccak256("j");
        uint256 dl = block.timestamp + 1;
        bytes memory sig = signWork(acceptorPk, d, j, 1e6, dl);
        vm.expectRevert(KibbleCore.NotAcceptor.selector);
        d.creditWork(j, 1e6, dl, sig);
    }

    function test_work_expired() public {
        bytes32 j = keccak256("j");
        uint256 dl = block.timestamp - 1;
        bytes memory sig = signWork(acceptorPk, d, j, 1e6, dl);
        vm.expectRevert(KibbleCore.Expired.selector);
        d.creditWork(j, 1e6, dl, sig);
    }

    function test_work_reclaimBudgetToVault() public {
        vm.prank(owner);
        adm(d).reclaimWorkBudget(10e6);
        assertEq(d.workBudget(), 20e6);
        assertEq(token.balanceOf(address(vault)), 10e6);
        assertBuckets(d);
    }

    // ------------------------------------------------------------ approval above the threshold

    function test_approval_ownerSignedBigPaymentGoesThrough() public {
        vm.prank(owner);
        adm(d).tightenSupplier(supplier, 1e6, 10e6);
        bytes32 b = bill();
        uint256 dl = block.timestamp + 10 minutes;
        // 2 is not above the threshold of 2, so use a stranger payment of 1.9 > U, which needs approval
        bytes memory sig = signApproval(d, attacker, 1.9e6, b, dl);
        vm.prank(agent);
        assertTrue(d.payWithApproval(attacker, 1.9e6, b, dl, sig));
        assertEq(token.balanceOf(attacker), 1.9e6);
        assertEq(d.receipt(1).approvedBy, owner);
        assertEq(d.unknownRemaining(), 1e6, "approved payments don't use U");
    }

    function test_approval_replayRefused() public {
        bytes32 b = bill();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = signApproval(d, supplier, 1.5e6, b, dl);
        vm.startPrank(agent);
        assertTrue(d.payWithApproval(supplier, 1.5e6, b, dl, sig));
        // same signature, new bill: the nonce moved on
        assertFalse(d.payWithApproval(supplier, 1.5e6, bill(), dl, sig));
        vm.stopPrank();
    }

    function test_approval_signatureFromAgentRefused() public {
        bytes32 b = bill();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = sign712(
            buyerPk, d, keccak256(abi.encode(d.PAY_APPROVAL_TYPEHASH(), supplier, 1e6, b, dl, d.approvalNonce()))
        );
        bytes32 fp = d.fingerprint(supplier, 1e6, b);
        vm.prank(agent);
        vm.expectEmit(true, false, false, true, address(d));
        emit KibbleCore.Refused(fp, Reason.BadApproval, supplier, 1e6, b);
        assertFalse(d.payWithApproval(supplier, 1e6, b, dl, sig));
    }

    function test_approval_expired() public {
        bytes32 b = bill();
        uint256 dl = block.timestamp;
        bytes memory sig = signApproval(d, supplier, 1e6, b, dl);
        skip(1);
        vm.prank(agent);
        assertFalse(d.payWithApproval(supplier, 1e6, b, dl, sig));
    }

    function test_approval_stillNeedsAllowance() public {
        bytes32 b = bill();
        uint256 dl = block.timestamp + 1;
        bytes memory sig = signApproval(d, supplier, 3e6, b, dl);
        vm.prank(agent);
        assertFalse(d.payWithApproval(supplier, 3e6, b, dl, sig), "allowance is 2");
        assertEq(d.approvalNonce(), 0, "refused approval can be retried");
    }
}
