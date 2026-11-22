// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {KibbleCore} from "./KibbleCore.sol";
import {
    Mode,
    State,
    Reason,
    WindowKind,
    Param,
    Action,
    Config,
    SupplierInit,
    AcceptorInit,
    Init,
    ReceiptData,
    Snapshot
} from "./KibbleTypes.sol";

interface IERC3009Receive {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title KibbleDrawer
/// @notice One per agent. Holds all of the agent's money and checks every rule inside every payment.
///         The agent key holds nothing; it can only ask the drawer to pay.
///
///         EARNED mode (Kibble): the agent spends from an allowance capped at an earned limit T. The
///         allowance refills only from verified value (cleared sales income or signed work credits).
///         Everything above it is swept to the owner's vault. Profit grows T slowly, losses shrink it at
///         once, and overspending walks the agent down Healthy -> Watch -> Braked -> Paused.
///
///         FIXED mode: the same code with a flat T refilled every window, no ceiling, no ladder and no
///         sweep. It exists so the split-screen comparison is fair.
///
///         Policy refusals never revert: they return false and emit `Refused`, so strikes persist.
contract KibbleDrawer is KibbleCore, Initializable {
    using SafeERC20 for IERC20;

    /// @notice Owner and guardian functions live in this module (code size). Unknown selectors are
    ///         delegatecalled to it, so they run on this drawer's storage with the caller's msg.sender.
    address public immutable adminModule;

    constructor(address adminModule_) EIP712("Kibble Drawer", "1") {
        if (adminModule_ == address(0)) revert ZeroAddress();
        adminModule = adminModule_;
        _disableInitializers();
    }

    fallback() external {
        address m = adminModule;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), m, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    // ================================================================= setup

    function initialize(Init calldata init) external initializer {
        Config calldata c = init.cfg;
        if (
            address(init.token) == address(0) || init.owner == address(0) || init.guardian == address(0)
                || init.agent == address(0) || init.vault == address(0)
        ) revert ZeroAddress();
        if (c.maxWeeklyLoss == 0 || c.windowLength == 0 || c.growthBps > BPS || c.carryBps > BPS) revert BadConfig();
        if (init.agent == init.owner || init.agent == init.guardian) revert BadConfig();

        token = init.token;
        mode = init.mode;
        owner = init.owner;
        guardian = init.guardian;
        agent = init.agent;
        vault = init.vault;

        maxWeeklyLoss = c.maxWeeklyLoss;
        approvalThreshold = c.maxWeeklyLoss / 10;
        tMin = c.tMin;
        maxStep = c.maxStep;
        minActivity = c.minActivity;
        slack = c.slack;
        growthBps = c.growthBps;
        carryBps = c.carryBps;
        windowLength = c.windowLength;
        strikeCooldown = c.strikeCooldown;
        delay = c.delay;
        drawdownPeriod = c.drawdownPeriod == 0 ? 7 days : c.drawdownPeriod;
        learningWindows = c.learningWindows;

        if (init.mode == Mode.FIXED) {
            if (c.fixedLimit == 0) revert BadConfig();
            limitT = c.fixedLimit;
            tMax = c.fixedLimit;
            costBps = BPS; // unused in FIXED
            unknownRemaining = 0; // allowlist only
            incomeHold = c.incomeHold; // same hold as EARNED, so refunds work on both sides
            state = State.Healthy;
        } else {
            tMax = c.maxWeeklyLoss / 2;
            uint256 tStart = c.maxWeeklyLoss / 10 < DEFAULT_T_START ? c.maxWeeklyLoss / 10 : DEFAULT_T_START;
            if (tStart < c.tMin) tStart = c.tMin;
            if (tStart > tMax || c.tMin > tMax) revert BadConfig();
            limitT = tStart;
            costBps = LEARNING_COST_BPS;
            unknownRemaining = c.unknownBudget;
            incomeHold = c.incomeHold;
            state = c.learningWindows == 0 ? State.Healthy : State.Learning;
        }

        windowStart = uint64(block.timestamp);
        highWaterAt = uint64(block.timestamp);

        for (uint256 i; i < init.suppliers.length; ++i) {
            SupplierInit calldata s = init.suppliers[i];
            _setSupplier(s.payee, s.perPayment, s.perWindow);
        }
        for (uint256 i; i < init.acceptors.length; ++i) {
            _setAcceptor(init.acceptors[i].acceptor, init.acceptors[i].perWindow);
        }
    }

    // ================================================================= agent: paying

    /// @notice Pay an approved supplier (within its caps) or a stranger (within U), from the allowance.
    /// @return ok false if refused; the reason is in the `Refused` event. Never reverts for policy.
    function pay(address payee, uint256 amount, bytes32 billRef) external onlyAgent returns (bool ok) {
        _sync();
        ok = _pay(payee, amount, billRef, address(0));
        _finish();
    }

    /// @notice Pay above `approvalThreshold` with the owner's EIP-712 signature over
    ///         PayApproval(payee, amount, billRef, deadline, approvalNonce). Skips the ceiling and caps
    ///         (the owner chose this payment) but still needs the allowance or runway.
    function payWithApproval(address payee, uint256 amount, bytes32 billRef, uint256 deadline, bytes calldata ownerSig)
        external
        onlyAgent
        returns (bool ok)
    {
        _sync();
        bytes32 fp = fingerprint(payee, amount, billRef);
        if (block.timestamp > deadline) {
            _refuse(fp, Reason.ApprovalExpired, payee, amount, billRef);
        } else {
            bytes32 digest = _hashTypedDataV4(
                keccak256(abi.encode(PAY_APPROVAL_TYPEHASH, payee, amount, billRef, deadline, approvalNonce))
            );
            (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, ownerSig);
            if (err != ECDSA.RecoverError.NoError || signer != owner) {
                _refuse(fp, Reason.BadApproval, payee, amount, billRef);
            } else {
                ok = _pay(payee, amount, billRef, owner);
                if (ok) ++approvalNonce; // a refused approval can be retried; a paid one can't be replayed
            }
        }
        _finish();
    }

    /// @notice Return a buyer's payment that hasn't cleared yet. Doesn't use U and isn't spend.
    function refund(bytes32 billRef) external onlyAgent {
        _sync();
        uint256 idPlus = saleOf[billRef];
        if (idPlus == 0) revert BadBillRef();
        Pending storage p = pendings[idPlus - 1];
        if (p.status != P_PENDING || p.payer == address(0)) revert NotPending();
        if (state == State.Revoked) revert Inactive();
        uint256 amt = p.amount;
        p.status = P_REFUNDED;
        pendingTotal -= amt;
        token.safeTransfer(p.payer, amt);
        emit Refunded(billRef, p.payer, amt);
        _finish();
    }

    // ================================================================= buyers and requesters: value in

    /// @notice A buyer pays for `billRef` (after approving the drawer). Income clears after the hold,
    ///         or when the buyer acknowledges delivery.
    function buy(bytes32 billRef, uint256 amount) external {
        _sync();
        _checkSale(billRef, amount);
        token.safeTransferFrom(msg.sender, address(this), amount);
        _addPending(msg.sender, billRef, amount);
        _finish();
    }

    /// @notice Gasless buy: the buyer signs an EIP-3009 ReceiveWithAuthorization to this drawer and
    ///         anyone relays it. The nonce must be `saleNonce(billRef)`, so a relayer can't reuse the
    ///         signature for a different bill.
    function buyWithAuthorization(
        bytes32 billRef,
        address from,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _sync();
        _checkSale(billRef, amount);
        IERC3009Receive(address(token)).receiveWithAuthorization(
            from, address(this), amount, validAfter, validBefore, saleNonce(billRef), v, r, s
        );
        _addPending(from, billRef, amount);
        _finish();
    }

    /// @notice The buyer confirms delivery, which clears the income at once.
    function ackDelivery(bytes32 billRef) external {
        _sync();
        uint256 idPlus = saleOf[billRef];
        if (idPlus == 0) revert BadBillRef();
        Pending storage p = pendings[idPlus - 1];
        if (p.payer != msg.sender) revert NotPayer();
        if (p.status != P_PENDING) revert NotPending();
        _clearOne(idPlus - 1);
        _finish();
    }

    /// @notice An approved acceptor signed WorkAccepted(jobId, value, deadline) for this drawer. Releases up
    ///         to `value` from the owner's work budget into this window's value. Anyone can submit it.
    function creditWork(bytes32 jobId, uint256 value, uint256 deadline, bytes calldata sig)
        external
        returns (uint256 credited)
    {
        _sync();
        if (state >= State.Paused) revert Inactive();
        if (block.timestamp > deadline) revert Expired();
        if (jobCredited[jobId]) revert AlreadyCredited();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(WORK_TYPEHASH, jobId, value, deadline)));
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError) revert BadSignature();
        Acceptor storage a = acceptors[signer];
        if (!a.ok || signer == agent) revert NotAcceptor();
        if (a.windowIdx != windowIndex) {
            a.windowIdx = uint64(windowIndex);
            a.used = 0;
        }
        uint256 room = a.perWindow - a.used;
        credited = value;
        if (credited > workBudget) credited = workBudget;
        if (credited > room) credited = room;
        if (credited == 0) revert NothingToCredit();
        jobCredited[jobId] = true;
        a.used += uint128(credited);
        workBudget -= credited;
        _addValue(credited);
        emit WorkCredited(jobId, signer, value, credited);
        _finish();
    }

    /// @notice Anyone can sync: clears income, closes windows, refills and sweeps.
    function sync() external {
        _sync();
        _finish();
    }

    // ================================================================= views

    function fingerprint(address payee, uint256 amount, bytes32 billRef) public pure returns (bytes32) {
        return keccak256(abi.encode(payee, amount, billRef));
    }

    /// @notice The EIP-3009 nonce a buyer signs for `billRef`.
    function saleNonce(bytes32 billRef) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), billRef));
    }

    /// @notice The most a hijacker holding the agent key could move out right now.
    ///         EARNED: the allowance plus any active runway (stranger payments come out of the allowance, so
    ///         U is inside this number, not on top). The vault is never reachable.
    ///         FIXED: the allowance plus the reserve that refills it every window until a human reacts.
    ///         Ongoing, an attacker spending at the normal cost share can skim at most
    ///         (costBps - learnedCostShareBps) of each window's value: see `skimBps`.
    function maxLossNow() public view returns (uint256) {
        if (state >= State.Paused) return 0;
        if (mode == Mode.FIXED) return allowance + reserve;
        return allowance + (block.timestamp <= runwayUntil ? runway : 0);
    }

    function skimBps() external view returns (uint256) {
        if (mode == Mode.FIXED || costBps <= learnedCostShareBps) return 0;
        return costBps - learnedCostShareBps;
    }

    /// @notice Spend still allowed under the cost ceiling this window (EARNED).
    function ceilingRoom() public view returns (uint256) {
        uint256 lim = _ceiling();
        return windowSpend >= lim ? 0 : lim - windowSpend;
    }

    function receipt(uint256 id) external view returns (ReceiptData memory) {
        return _receipts[id];
    }

    function queued(bytes32 id) external view returns (Queued memory) {
        return _queue[id];
    }

    function snapshot() external view returns (Snapshot memory s) {
        s.mode = mode;
        s.state = state;
        s.limitT = limitT;
        s.tMax = tMax;
        s.allowance = allowance;
        s.pendingTotal = pendingTotal;
        s.workBudget = workBudget;
        s.runway = runway;
        s.reserve = reserve;
        s.unknownRemaining = unknownRemaining;
        s.costBps = costBps;
        s.learnedCostShareBps = learnedCostShareBps;
        s.windowIndex = windowIndex;
        s.windowValue = windowValue;
        s.windowSpend = windowSpend;
        s.windowEndsAt = windowStart + windowLength;
        s.strikes = strikes;
        s.maxLossNow = maxLossNow();
        s.drawdown = drawdown();
        s.lifetimeValue = lifetimeValue;
        s.lifetimeSpend = lifetimeSpend;
        s.receiptCount = receiptCount;
        s.balance = token.balanceOf(address(this));
    }

    // ================================================================= internals: paying

    function _pay(address payee, uint256 amount, bytes32 billRef, address approver) internal returns (bool) {
        bytes32 fp = fingerprint(payee, amount, billRef);
        if (state == State.Paused) return _refuse(fp, Reason.StatePaused, payee, amount, billRef);
        if (state == State.Revoked) return _refuse(fp, Reason.StateRevoked, payee, amount, billRef);
        if (amount == 0 || payee == address(0)) return _refuse(fp, Reason.ZeroAmount, payee, amount, billRef);
        if (usedFingerprint[fp]) return _refuse(fp, Reason.DuplicateBill, payee, amount, billRef);
        bool approved = approver != address(0);
        if (!approved && amount > approvalThreshold) {
            return _refuse(fp, Reason.NeedsApproval, payee, amount, billRef);
        }

        Supplier storage s = suppliers[payee];
        if (!approved) {
            if (s.ok) {
                if (s.windowIdx != windowIndex) {
                    s.windowIdx = uint64(windowIndex);
                    s.spent = 0;
                }
                if (amount > s.perPayment) return _refuse(fp, Reason.OverSupplierPayment, payee, amount, billRef);
                if (s.spent + amount > s.perWindow) {
                    return _refuse(fp, Reason.OverSupplierWindow, payee, amount, billRef);
                }
            } else if (amount > unknownRemaining) {
                return _refuse(fp, Reason.OverUnknownBudget, payee, amount, billRef);
            }
        }

        bool fromRunway = runway >= amount && block.timestamp <= runwayUntil;
        if (!fromRunway && amount > allowance) return _refuse(fp, Reason.OverAllowance, payee, amount, billRef);

        if (mode == Mode.EARNED && !fromRunway && !approved && windowSpend + amount > _ceiling()) {
            _strike(amount);
            return _refuse(fp, Reason.OverCeiling, payee, amount, billRef);
        }

        // effects
        usedFingerprint[fp] = true;
        if (fromRunway) {
            runway -= amount; // invested runway is not counted as spend (no loss, no ceiling)
        } else {
            allowance -= amount;
            windowSpend += amount;
            lifetimeSpend += amount;
            net -= int256(amount);
        }
        if (!approved) {
            if (s.ok) s.spent += uint128(amount);
            else unknownRemaining -= amount;
        }
        if (!s.ok) strangerPaid += amount;

        uint256 id = ++receiptCount;
        ReceiptData storage r = _receipts[id];
        r.fp = fp;
        r.billRef = billRef;
        r.payee = payee;
        r.time = uint64(block.timestamp);
        r.state = state;
        r.approvedBy = approved ? approver : msg.sender;
        r.amount = uint128(amount);
        r.limitT = uint128(limitT);
        r.windowValue = uint128(windowValue);
        r.windowSpend = uint128(windowSpend);

        // interaction
        token.safeTransfer(payee, amount);
        emit Paid(fp, payee, amount, id);
        emit ReceiptIssued(id, fp, payee, amount, billRef, state, limitT, windowValue, windowSpend, r.approvedBy);
        _checkDrawdown();
        return true;
    }

    function _refuse(bytes32 fp, Reason why, address payee, uint256 amount, bytes32 billRef)
        internal
        returns (bool)
    {
        emit Refused(fp, why, payee, amount, billRef);
        return false;
    }

    function _ceiling() internal view returns (uint256) {
        if (mode == Mode.FIXED) return type(uint256).max;
        // Uncleared sales count toward the ceiling (an agent buys its inputs before the buyer
        // acknowledges delivery) but never toward T or refills.
        uint256 base = windowValue + pendingTotal + (prevValue * carryBps) / BPS;
        return (base * costBps) / BPS + slack;
    }

    function _strike(uint256 attempted) internal {
        if (windowSpend + attempted < minActivity) return; // donation griefing: no strikes on tiny activity
        if (lastStrikeAt != 0 && block.timestamp < lastStrikeAt + strikeCooldown) return;
        strikes += 1;
        lastStrikeAt = uint64(block.timestamp);
        emit Strike(strikes, attempted);
        State target = strikes >= 3 ? State.Paused : strikes == 2 ? State.Braked : State.Watch;
        _escalate(target, Reason.Strike);
    }
}
