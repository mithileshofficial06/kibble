// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
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

/// @title KibbleAdmin
/// @notice Owner and guardian functions of a drawer. Never used directly: the drawer delegatecalls it, so it
///         runs on the drawer's storage. Called on its own it has no owner, so every function reverts.
contract KibbleAdmin is KibbleCore {
    using SafeERC20 for IERC20;

    constructor() EIP712("Kibble Drawer", "1") {}
    // ================================================================= owner: funding

    /// @notice Owner tops up the allowance (EARNED: up to the refill cap) or the reserve (FIXED).
    ///         Never counts as value.
    function fundAllowance(uint256 amount) external onlyOwner {
        _sync();
        if (state >= State.Paused) revert Inactive();
        if (mode == Mode.EARNED) {
            uint256 cap = _refillCap();
            if (allowance + amount > cap) revert OverRoom();
            token.safeTransferFrom(msg.sender, address(this), amount);
            allowance += amount;
        } else {
            token.safeTransferFrom(msg.sender, address(this), amount);
            reserve += amount;
            _fixedRefill();
        }
        lifetimeFunding += amount;
        emit Funded(0, amount);
        _finish();
    }

    /// @notice Owner sets aside budget that accepted work releases (V1). Not spendable on its own.
    function fundWorkBudget(uint256 amount) external onlyOwner {
        _sync();
        if (mode != Mode.EARNED) revert WrongMode();
        token.safeTransferFrom(msg.sender, address(this), amount);
        workBudget += amount;
        emit Funded(1, amount);
        _finish();
    }

    /// @notice Owner takes unused work budget back to the vault (tightening, instant).
    function reclaimWorkBudget(uint256 amount) external onlyOwner {
        _sync();
        if (amount > workBudget) amount = workBudget;
        workBudget -= amount;
        _noValue += amount;
        _finish();
    }

    /// @notice Time-boxed spend that doesn't count as loss (V5), for agents that must invest first.
    ///         Paid before the allowance while active; the rest goes to the vault when it expires.
    function grantRunway(uint256 amount, uint64 until) external onlyOwner {
        _sync();
        if (mode != Mode.EARNED) revert WrongMode();
        if (state >= State.Paused) revert Inactive();
        if (until <= block.timestamp || runway + amount > maxWeeklyLoss) revert OverRoom();
        token.safeTransferFrom(msg.sender, address(this), amount);
        runway += amount;
        runwayUntil = until;
        lifetimeFunding += amount;
        emit Funded(2, amount);
        emit RunwayGranted(amount, until);
        _finish();
    }

    // ================================================================= owner and guardian: controls

    function freeze() external onlyOwnerOrGuardian {
        _sync();
        if (state < State.Paused) _setState(State.Paused, Reason.OwnerFreeze);
        _finish();
    }

    /// @notice Permanent. Sends everything in the drawer to the vault.
    function revoke() external onlyOwnerOrGuardian {
        _sync();
        if (state != State.Revoked) _setState(State.Revoked, Reason.OwnerRevoke);
        allowance = 0;
        pendingTotal = 0;
        workBudget = 0;
        runway = 0;
        reserve = 0;
        _unplaced = 0;
        _noValue = 0;
        uint256 bal = token.balanceOf(address(this));
        if (bal > 0) {
            token.safeTransfer(vault, bal);
            emit Swept(bal);
        }
        lastBalance = 0;
    }

    /// @notice Lower any setting at once. Raising goes through `queue`.
    function tighten(Param p, uint256 value) external onlyOwnerOrGuardian {
        _sync();
        if (value > _getParam(p)) revert NotTighter();
        _setParam(p, value);
        _finish();
    }

    function tightenSupplier(address payee, uint128 perPayment, uint128 perWindow) external onlyOwnerOrGuardian {
        Supplier storage s = suppliers[payee];
        if (!s.ok || perPayment > s.perPayment || perWindow > s.perWindow) revert NotTighter();
        s.perPayment = perPayment;
        s.perWindow = perWindow;
        emit SupplierSet(payee, true, perPayment, perWindow);
    }

    function removeSupplier(address payee) external onlyOwnerOrGuardian {
        delete suppliers[payee];
        emit SupplierSet(payee, false, 0, 0);
    }

    function removeAcceptor(address acceptor) external onlyOwnerOrGuardian {
        delete acceptors[acceptor];
        emit AcceptorSet(acceptor, false, 0);
    }

    /// @notice Queue a loosening action. Ready after `delay` (SetGuardian: 7x). Guardian can cancel.
    function queue(Action action, bytes calldata data) external onlyOwner returns (bytes32 id) {
        id = keccak256(abi.encode(action, data, queueNonce++));
        uint64 wait = action == Action.SetGuardian ? delay * GUARDIAN_DELAY_MULT : delay;
        uint64 readyAt = uint64(block.timestamp) + wait;
        _queue[id] = Queued({action: action, status: Q_QUEUED, readyAt: readyAt, data: data});
        emit ActionQueued(id, action, data, readyAt);
    }

    function execute(bytes32 id) external onlyOwner {
        Queued storage q = _queue[id];
        if (q.status != Q_QUEUED) revert NotQueued();
        if (block.timestamp < q.readyAt) revert NotReady();
        if (state == State.Revoked) revert Inactive();
        _sync();
        q.status = Q_DONE;
        _apply(q.action, q.data);
        emit ActionExecuted(id, q.action);
        _finish();
    }

    function cancel(bytes32 id) external onlyOwnerOrGuardian {
        Queued storage q = _queue[id];
        if (q.status != Q_QUEUED) revert NotQueued();
        if (msg.sender == guardian && msg.sender != owner && q.action == Action.SetGuardian) {
            revert GuardianCannotCancel();
        }
        q.status = Q_CANCELLED;
        emit ActionCancelled(id, msg.sender);
    }

    /// @notice Instant resume when owner and guardian both sign Resume(resumeNonce, deadline).
    function resumeNow(uint256 deadline, bytes calldata ownerSig, bytes calldata guardianSig) external {
        if (block.timestamp > deadline) revert Expired();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(RESUME_TYPEHASH, resumeNonce, deadline)));
        (address a, ECDSA.RecoverError e1,) = ECDSA.tryRecover(digest, ownerSig);
        (address b, ECDSA.RecoverError e2,) = ECDSA.tryRecover(digest, guardianSig);
        if (e1 != ECDSA.RecoverError.NoError || e2 != ECDSA.RecoverError.NoError || a != owner || b != guardian) {
            revert BadSignature();
        }
        ++resumeNonce;
        _sync();
        _resume();
        _finish();
    }

    // ================================================================= internals: settings

    function _apply(Action a, bytes memory data) internal {
        if (a == Action.AddSupplier) {
            (address payee, uint128 perPayment, uint128 perWindow) = abi.decode(data, (address, uint128, uint128));
            _setSupplier(payee, perPayment, perWindow);
        } else if (a == Action.AddAcceptor) {
            (address acc, uint128 perWindow) = abi.decode(data, (address, uint128));
            _setAcceptor(acc, perWindow);
        } else if (a == Action.RaiseParam) {
            (Param p, uint256 value) = abi.decode(data, (Param, uint256));
            _setParam(p, value);
        } else if (a == Action.Resume) {
            _resume();
        } else if (a == Action.SetAgent) {
            address na = abi.decode(data, (address));
            if (na == address(0) || na == owner || na == guardian || acceptors[na].ok || suppliers[na].ok) {
                revert BadConfig();
            }
            agent = na;
            emit AgentSet(na);
        } else {
            address ng = abi.decode(data, (address));
            if (ng == address(0) || ng == agent) revert BadConfig();
            guardian = ng;
            emit GuardianSet(ng);
        }
    }

    function _getParam(Param p) internal view returns (uint256) {
        if (p == Param.T) return limitT;
        if (p == Param.TMax) return tMax;
        if (p == Param.TMin) return tMin;
        if (p == Param.CostBps) return costBps;
        if (p == Param.ApprovalThreshold) return approvalThreshold;
        if (p == Param.UnknownBudget) return unknownRemaining;
        if (p == Param.MaxWeeklyLoss) return maxWeeklyLoss;
        if (p == Param.GrowthBps) return growthBps;
        if (p == Param.MaxStep) return maxStep;
        if (p == Param.Slack) return slack;
        if (p == Param.CarryBps) return carryBps;
        return minActivity;
    }

    function _setParam(Param p, uint256 v) internal {
        uint256 old = _getParam(p);
        if (p == Param.T) {
            if (v > tMax || v < tMin) revert BadConfig();
            limitT = v;
        } else if (p == Param.TMax) {
            if (v < tMin) revert BadConfig();
            tMax = v;
            if (limitT > v) limitT = v;
        } else if (p == Param.TMin) {
            if (v > limitT) revert BadConfig();
            tMin = v;
        } else if (p == Param.CostBps) {
            if (v > BPS) revert BadConfig();
            costBps = v;
        } else if (p == Param.ApprovalThreshold) {
            approvalThreshold = v;
        } else if (p == Param.UnknownBudget) {
            if (mode == Mode.FIXED && v > 0) revert WrongMode();
            unknownRemaining = v;
        } else if (p == Param.MaxWeeklyLoss) {
            if (v == 0) revert BadConfig();
            maxWeeklyLoss = v;
        } else if (p == Param.GrowthBps) {
            if (v > BPS) revert BadConfig();
            growthBps = v;
        } else if (p == Param.MaxStep) {
            maxStep = v;
        } else if (p == Param.Slack) {
            slack = v;
        } else if (p == Param.CarryBps) {
            if (v > BPS) revert BadConfig();
            carryBps = v;
        } else {
            minActivity = v;
        }
        if (allowance > limitT) {
            _noValue += allowance - limitT;
            allowance = limitT;
        }
        emit ParamChanged(p, old, v);
    }
}
