// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Mode, State, Reason, WindowKind, Param, Action, ReceiptData} from "./KibbleTypes.sol";

/// @title KibbleCore
/// @notice Storage, events and the sync / window / ladder machinery shared by KibbleDrawer and KibbleAdmin.
///         Both contracts inherit this exact layout; the drawer delegatecalls KibbleAdmin for owner and
///         guardian functions, so storage must never be declared anywhere else.
abstract contract KibbleCore is EIP712 {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant LEARNING_COST_BPS = 9_000; // loose ceiling while learning
    uint256 internal constant LEARN_MARGIN_BPS = 1_000; // learned cost share + 10 points
    uint256 internal constant MAX_COST_BPS = 9_500;
    uint256 internal constant MAX_CLEAR_PER_SYNC = 32;
    uint64 internal constant GUARDIAN_DELAY_MULT = 7;
    uint256 internal constant DEFAULT_T_START = 2e6; // 2 tUSD8

    uint8 internal constant P_NONE = 0;
    uint8 internal constant P_PENDING = 1;
    uint8 internal constant P_CLEARED = 2;
    uint8 internal constant P_REFUNDED = 3;

    uint8 internal constant Q_NONE = 0;
    uint8 internal constant Q_QUEUED = 1;
    uint8 internal constant Q_DONE = 2;
    uint8 internal constant Q_CANCELLED = 3;

    bytes32 public constant PAY_APPROVAL_TYPEHASH =
        keccak256("PayApproval(address payee,uint256 amount,bytes32 billRef,uint256 deadline,uint256 nonce)");
    bytes32 public constant WORK_TYPEHASH =
        keccak256("WorkAccepted(bytes32 jobId,uint256 value,uint256 deadline)");
    bytes32 public constant RESUME_TYPEHASH = keccak256("Resume(uint256 nonce,uint256 deadline)");

    struct Supplier {
        bool ok;
        uint128 perPayment;
        uint128 perWindow;
        uint128 spent; // in window `windowIdx`
        uint64 windowIdx;
    }

    struct Acceptor {
        bool ok;
        uint128 perWindow;
        uint128 used; // in window `windowIdx`
        uint64 windowIdx;
    }

    struct Pending {
        address payer; // 0 for plain transfers
        uint8 status;
        uint64 clearAt;
        uint128 amount;
        bytes32 billRef;
    }

    struct Queued {
        Action action;
        uint8 status;
        uint64 readyAt;
        bytes data;
    }

    // ---------------------------------------------------------------- roles
    IERC20 public token;
    Mode public mode;
    address public owner;
    address public guardian;
    address public agent;
    address public vault;
    State public state;

    // ---------------------------------------------------------------- limits
    uint256 public limitT; // T
    uint256 public tMax;
    uint256 public tMin;
    uint256 public costBps;
    uint256 public approvalThreshold;
    uint256 public unknownRemaining; // U left
    uint256 public maxWeeklyLoss; // L
    uint256 public growthBps;
    uint256 public maxStep;
    uint256 public slack;
    uint256 public carryBps;
    uint256 public minActivity;
    uint64 public windowLength;
    uint64 public incomeHold;
    uint64 public strikeCooldown;
    uint64 public delay;
    uint64 public drawdownPeriod;
    uint32 public learningWindows;

    // ---------------------------------------------------------------- buckets
    // Between calls: token balance == allowance + pendingTotal + workBudget + runway + reserve.
    uint256 public allowance;
    uint256 public pendingTotal;
    uint256 public workBudget;
    uint256 public runway;
    uint256 public reserve; // FIXED mode only: cleared income waiting for the next window refill
    uint64 public runwayUntil;
    uint256 public lastBalance;
    uint256 internal _unplaced; // cleared value not yet placed (refill, then sweep)
    uint256 internal _noValue; // tokens that never count as value (sweep in EARNED, reserve in FIXED)

    // ---------------------------------------------------------------- window
    uint256 public windowIndex;
    uint64 public windowStart;
    uint256 public windowValue;
    uint256 public windowSpend;
    uint256 public prevValue;

    // ---------------------------------------------------------------- learning
    uint256 public learnValue;
    uint256 public learnSpend;
    uint32 public learnedWindows;
    uint256 public learnedCostShareBps;

    // ---------------------------------------------------------------- ladder and drawdown
    uint8 public strikes;
    uint8 public cleanWindows;
    uint64 public lastStrikeAt;
    int256 public net; // lifetime value - lifetime spend
    int256 public highWater;
    uint64 public highWaterAt;

    // ---------------------------------------------------------------- lifetime
    uint256 public lifetimeValue;
    uint256 public lifetimeSpend;
    uint256 public lifetimeFunding;
    uint256 public strangerPaid;

    // ---------------------------------------------------------------- records
    mapping(address => Supplier) public suppliers;
    mapping(address => Acceptor) public acceptors;
    mapping(bytes32 => bool) public usedFingerprint;
    mapping(bytes32 => bool) public jobCredited;
    mapping(uint256 => ReceiptData) internal _receipts;
    uint256 public receiptCount;
    mapping(uint256 => Pending) public pendings;
    mapping(bytes32 => uint256) public saleOf; // billRef => pending id + 1
    uint256 public pendHead;
    uint256 public pendTail;
    mapping(bytes32 => Queued) internal _queue;
    uint256 public queueNonce;
    uint256 public approvalNonce;
    uint256 public resumeNonce;
    uint256 internal _clearBlock;
    uint256 internal _clearedInBlock;

    // ---------------------------------------------------------------- events
    event Paid(bytes32 indexed fp, address indexed payee, uint256 amount, uint256 receiptId);
    event Refused(bytes32 indexed fp, Reason reason, address payee, uint256 amount, bytes32 billRef);
    event ReceiptIssued(
        uint256 indexed id,
        bytes32 fp,
        address payee,
        uint256 amount,
        bytes32 billRef,
        State state,
        uint256 limitT,
        uint256 windowValue,
        uint256 windowSpend,
        address approvedBy
    );
    event StateChanged(State from, State to, Reason why);
    event Strike(uint256 count, uint256 attemptedSpend);
    event WindowClosed(
        uint256 indexed index, uint256 value, uint256 spend, int256 profit, uint256 newT, WindowKind kind
    );
    event TrackRecord(
        uint256 indexed index,
        uint256 value,
        uint256 spend,
        int256 profit,
        uint256 limitT,
        State state,
        uint256 strikes
    );
    event LearningDone(uint256 costShareBps, uint256 costBps);
    event Alert(uint256 indexed windowIndex, uint256 loss); // FIXED mode: "a human should look at this"
    event Swept(uint256 amount);
    event IncomePending(
        uint256 indexed id, bytes32 indexed billRef, address payer, uint256 amount, uint256 clearAt
    );
    event IncomeCleared(uint256 indexed id, uint256 value, uint256 excessToVault);
    event Refunded(bytes32 indexed billRef, address payer, uint256 amount);
    event WorkCredited(bytes32 indexed jobId, address indexed acceptor, uint256 requested, uint256 credited);
    event Funded(uint8 kind, uint256 amount); // 0 allowance, 1 work budget, 2 runway
    event RunwayGranted(uint256 amount, uint256 until);
    event RunwayExpired(uint256 amount);
    event UnexplainedOutflow(uint256 amount);
    event ParamChanged(Param indexed p, uint256 oldValue, uint256 newValue);
    event SupplierSet(address indexed payee, bool ok, uint256 perPayment, uint256 perWindow);
    event AcceptorSet(address indexed acceptor, bool ok, uint256 perWindow);
    event AgentSet(address agent);
    event GuardianSet(address guardian);
    event ActionQueued(bytes32 indexed id, Action action, bytes data, uint256 readyAt);
    event ActionExecuted(bytes32 indexed id, Action action);
    event ActionCancelled(bytes32 indexed id, address by);

    // ---------------------------------------------------------------- errors
    error NotAgent();
    error NotOwner();
    error NotOwnerOrGuardian();
    error ZeroAddress();
    error BadConfig();
    error NotTighter();
    error Inactive();
    error BadBillRef();
    error NotPayer();
    error NotPending();
    error Expired();
    error BadSignature();
    error AlreadyCredited();
    error NotAcceptor();
    error NothingToCredit();
    error OverRoom();
    error NotReady();
    error NotQueued();
    error GuardianCannotCancel();
    error NothingToResume();
    error WrongMode();

    // ================================================================= modifiers

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian) revert NotOwnerOrGuardian();
        _;
    }

    // ================================================================= shared views

    function drawdown() public view returns (uint256) {
        return highWater > net ? uint256(highWater - net) : 0;
    }

    // ================================================================= internals: sync

    function _sync() internal {
        uint256 bal = token.balanceOf(address(this));
        if (state == State.Revoked) {
            if (bal > 0) {
                token.safeTransfer(vault, bal);
                emit Swept(bal);
            }
            lastBalance = 0;
            return;
        }
        // 1. outflow nobody explained: pause
        if (bal < lastBalance) {
            uint256 missing = lastBalance - bal;
            _absorb(missing);
            emit UnexplainedOutflow(missing);
            if (state < State.Paused) _setState(State.Paused, Reason.UnexplainedOutflow);
        } else if (bal > lastBalance) {
            // 2. plain transfers in: pending income (or no value while Paused)
            uint256 extra = bal - lastBalance;
            if (state == State.Paused) _noValue += extra;
            else _addPending(address(0), bytes32(0), extra);
        }
        lastBalance = bal;
        _clearDue();
        if (runway > 0 && block.timestamp > runwayUntil) {
            emit RunwayExpired(runway);
            _noValue += runway;
            runway = 0;
        }
        // 3. close the window if due
        _maybeCloseWindow();
    }

    /// @dev Place cleared value (refill, then sweep) and record the real balance.
    function _finish() internal {
        if (state == State.Revoked) return;
        if (mode == Mode.FIXED) {
            reserve += _unplaced + _noValue;
            _unplaced = 0;
            _noValue = 0;
        } else {
            uint256 cap = _refillCap();
            if (_unplaced > 0 && allowance < cap) {
                uint256 top = cap - allowance;
                if (top > _unplaced) top = _unplaced;
                allowance += top;
                _unplaced -= top;
            }
            uint256 out = _unplaced + _noValue;
            _unplaced = 0;
            _noValue = 0;
            if (out > 0) {
                token.safeTransfer(vault, out);
                emit Swept(out);
            }
        }
        lastBalance = token.balanceOf(address(this));
    }

    function _absorb(uint256 missing) internal {
        missing = _takeFrom(reserve, missing, 0);
        missing = _takeFrom(allowance, missing, 1);
        missing = _takeFrom(runway, missing, 2);
        missing = _takeFrom(workBudget, missing, 3);
        _takeFrom(pendingTotal, missing, 4);
    }

    function _takeFrom(uint256 bucket, uint256 missing, uint8 which) internal returns (uint256) {
        uint256 t = bucket < missing ? bucket : missing;
        if (t == 0) return missing;
        if (which == 0) reserve -= t;
        else if (which == 1) allowance -= t;
        else if (which == 2) runway -= t;
        else if (which == 3) workBudget -= t;
        else pendingTotal -= t;
        return missing - t;
    }

    function _checkSale(bytes32 billRef, uint256 amount) internal view {
        if (state >= State.Paused) revert Inactive();
        if (billRef == bytes32(0) || saleOf[billRef] != 0 || amount == 0) revert BadBillRef();
    }

    function _addPending(address payer, bytes32 billRef, uint256 amount) internal {
        uint256 id = pendTail++;
        uint64 clearAt = uint64(block.timestamp) + incomeHold;
        pendings[id] = Pending({
            payer: payer, status: P_PENDING, clearAt: clearAt, amount: uint128(amount), billRef: billRef
        });
        pendingTotal += amount;
        if (billRef != bytes32(0)) saleOf[billRef] = id + 1;
        emit IncomePending(id, billRef, payer, amount, clearAt);
    }

    function _clearDue() internal {
        uint256 n;
        uint256 head = pendHead;
        uint256 tail = pendTail;
        while (head < tail && n < MAX_CLEAR_PER_SYNC) {
            Pending storage p = pendings[head];
            if (p.status == P_PENDING) {
                if (p.clearAt > block.timestamp) break;
                _clearOne(head);
                ++n;
            }
            ++head;
        }
        pendHead = head;
    }

    function _clearOne(uint256 id) internal {
        Pending storage p = pendings[id];
        uint256 amt = p.amount;
        if (amt > pendingTotal) amt = pendingTotal; // only after an unexplained outflow
        p.status = P_CLEARED;
        pendingTotal -= amt;
        if (state >= State.Paused) {
            _noValue += amt; // income while Paused never counts as value
            emit IncomeCleared(id, 0, amt);
            return;
        }
        uint256 v = amt;
        if (mode == Mode.EARNED) {
            // deferred-income trick: at most max(T, last window's value) clears as value per block
            uint256 blockKey = (block.timestamp << 128) | block.number;
            if (blockKey != _clearBlock) {
                _clearBlock = blockKey;
                _clearedInBlock = 0;
            }
            uint256 cap = limitT > prevValue ? limitT : prevValue;
            uint256 room = cap > _clearedInBlock ? cap - _clearedInBlock : 0;
            if (v > room) v = room;
            _clearedInBlock += v;
            _noValue += amt - v;
        }
        _addValue(v);
        emit IncomeCleared(id, v, amt - v);
    }

    function _addValue(uint256 v) internal {
        if (v == 0) return;
        windowValue += v;
        lifetimeValue += v;
        net += int256(v);
        _unplaced += v;
        if (net > highWater) {
            highWater = net;
            highWaterAt = uint64(block.timestamp);
        }
    }

    function _refillCap() internal view returns (uint256) {
        if (state == State.Learning || state == State.Healthy) return limitT;
        if (state == State.Watch) return limitT / 2;
        return 0;
    }

    function _fixedRefill() internal {
        if (allowance >= limitT || state >= State.Paused) return;
        uint256 top = limitT - allowance;
        if (top > reserve) top = reserve;
        reserve -= top;
        allowance += top;
    }

    // ================================================================= internals: windows and ladder

    function _maybeCloseWindow() internal {
        uint64 len = windowLength;
        if (block.timestamp < windowStart + len) return;
        uint256 n = (block.timestamp - windowStart) / len;
        _closeWindow();
        windowStart += uint64(n * len);
        prevValue = n == 1 ? windowValue : 0;
        windowIndex += n;
        windowValue = 0;
        windowSpend = 0;
        if (mode == Mode.FIXED) _fixedRefill();
    }

    function _closeWindow() internal {
        uint256 v = windowValue;
        uint256 s = windowSpend;
        int256 profit = int256(v) - int256(s);
        bool quiet = v < minActivity && s < minActivity;
        WindowKind kind = quiet
            ? WindowKind.Quiet
            : profit > 0 ? WindowKind.Profit : profit < 0 ? WindowKind.Loss : WindowKind.Even;

        if (mode == Mode.FIXED) {
            if (kind == WindowKind.Loss) emit Alert(windowIndex, s - v);
        } else if (state == State.Learning) {
            if (!quiet) {
                learnValue += v;
                learnSpend += s;
                ++learnedWindows;
            }
            if (learnedWindows >= learningWindows) _finishLearning();
        } else if (!quiet && state < State.Paused) {
            if (profit > 0) {
                uint256 grow = (uint256(profit) * growthBps) / BPS;
                if (grow > maxStep) grow = maxStep;
                uint256 nt = limitT + grow;
                limitT = nt > tMax ? tMax : nt;
            } else if (profit < 0) {
                uint256 loss = uint256(-profit);
                limitT = limitT > tMin + loss ? limitT - loss : tMin;
            }
            _ladderOnWindow(kind);
            if (allowance > limitT) {
                _noValue += allowance - limitT; // keep allowance <= T
                allowance = limitT;
            }
        }
        emit WindowClosed(windowIndex, v, s, profit, limitT, kind);
        emit TrackRecord(windowIndex, v, s, profit, limitT, state, strikes);
        _checkDrawdown();
    }

    function _finishLearning() internal {
        uint256 share =
            learnValue == 0 ? LEARNING_COST_BPS - LEARN_MARGIN_BPS : (learnSpend * BPS) / learnValue;
        uint256 c = share + LEARN_MARGIN_BPS;
        if (c > MAX_COST_BPS) c = MAX_COST_BPS;
        learnedCostShareBps = share;
        costBps = c;
        emit LearningDone(share, c);
        _setState(State.Healthy, Reason.LearningDone);
    }

    function _ladderOnWindow(WindowKind kind) internal {
        if (kind == WindowKind.Loss) {
            cleanWindows = 0;
            _escalate(State.Watch, Reason.LossWindow);
            return;
        }
        if (state == State.Watch) {
            if (++cleanWindows >= 2) {
                cleanWindows = 0;
                strikes = 0;
                _setState(State.Healthy, Reason.CleanWindows);
            }
        } else if (state == State.Braked && kind == WindowKind.Profit) {
            cleanWindows = 0;
            _setState(State.Watch, Reason.Recovery);
        }
    }

    function _checkDrawdown() internal {
        if (mode == Mode.FIXED || state >= State.Paused) return;
        if (block.timestamp >= highWaterAt + drawdownPeriod) {
            highWater = net; // rolling: the mark resets once per period
            highWaterAt = uint64(block.timestamp);
        }
        uint256 dd = drawdown();
        if (dd >= maxWeeklyLoss) _escalate(State.Paused, Reason.Drawdown);
        else if (dd * 2 >= maxWeeklyLoss) _escalate(State.Braked, Reason.Drawdown);
    }

    function _escalate(State target, Reason why) internal {
        if (mode == Mode.FIXED && target != State.Paused) return; // no ladder in FIXED
        if (state == State.Learning && target == State.Watch) return; // learning ignores single strikes
        if (uint8(target) > uint8(state)) _setState(target, why);
    }

    function _setState(State to, Reason why) internal {
        State from = state;
        if (from == to) return;
        state = to;
        emit StateChanged(from, to, why);
    }

    function _resume() internal {
        if (state != State.Paused && state != State.Braked) revert NothingToResume();
        strikes = 0;
        cleanWindows = 0;
        lastStrikeAt = 0;
        highWater = net;
        highWaterAt = uint64(block.timestamp);
        State to = mode == Mode.FIXED
            ? State.Healthy
            : (learnedWindows < learningWindows ? State.Learning : State.Watch);
        _setState(to, Reason.OwnerResume);
        if (mode == Mode.FIXED) _fixedRefill();
    }

    // ================================================================= internals: suppliers and acceptors

    function _setSupplier(address payee, uint128 perPayment, uint128 perWindow) internal {
        if (payee == address(0) || payee == agent || payee == address(this) || payee == vault) {
            revert BadConfig();
        }
        if (perWindow == 0) perWindow = uint128(tMax);
        Supplier storage s = suppliers[payee];
        s.ok = true;
        s.perPayment = perPayment;
        s.perWindow = perWindow;
        emit SupplierSet(payee, true, perPayment, perWindow);
    }

    function _setAcceptor(address acc, uint128 perWindow) internal {
        if (acc == address(0) || acc == agent) revert BadConfig();
        Acceptor storage a = acceptors[acc];
        a.ok = true;
        a.perWindow = perWindow;
        emit AcceptorSet(acc, true, perWindow);
    }
}
