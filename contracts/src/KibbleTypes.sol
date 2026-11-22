// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// FIXED = the comparison side of the split screen (flat limit, refilled every window).
/// EARNED = Kibble (allowance refilled only by verified value, profit swept, wallet brakes the agent).
enum Mode {
    FIXED,
    EARNED
}

/// Ordered from least to most restrictive (Learning is the first-N-windows calibration state).
enum State {
    Learning,
    Healthy,
    Watch,
    Braked,
    Paused,
    Revoked
}

/// One enum for refusals and for state changes, so every UI row has one plain-words reason.
enum Reason {
    None,
    // refusals
    StatePaused,
    StateRevoked,
    ZeroAmount,
    DuplicateBill,
    NeedsApproval,
    BadApproval,
    ApprovalExpired,
    OverSupplierPayment,
    OverSupplierWindow,
    OverUnknownBudget,
    OverAllowance,
    OverCeiling,
    // state changes
    Strike,
    LossWindow,
    CleanWindows,
    Recovery,
    Drawdown,
    LearningDone,
    OwnerFreeze,
    OwnerResume,
    OwnerRevoke,
    UnexplainedOutflow
}

enum WindowKind {
    Quiet,
    Loss,
    Profit,
    Even
}

/// Settings the owner can lower instantly (`tighten`) or raise through the delay queue.
enum Param {
    T,
    TMax,
    TMin,
    CostBps,
    ApprovalThreshold,
    UnknownBudget,
    MaxWeeklyLoss,
    GrowthBps,
    MaxStep,
    Slack,
    CarryBps,
    MinActivity
}

/// Loosening actions. They wait `delay` (SetGuardian waits 7x) and the guardian can cancel them.
enum Action {
    AddSupplier, // abi.encode(address payee, uint128 perPayment, uint128 perWindow)
    AddAcceptor, // abi.encode(address acceptor, uint128 perWindow)
    RaiseParam, // abi.encode(Param p, uint256 value)
    Resume, // ""
    SetAgent, // abi.encode(address agent)
    SetGuardian // abi.encode(address guardian); the guardian can't cancel this one
}

/// Everything except `maxWeeklyLoss` has a sensible default; see KibbleFactory.defaultConfig.
struct Config {
    uint256 maxWeeklyLoss; // L: the one owner setting. Tmax = L/2, Tstart = min(2, L/10), approval = L/10
    uint256 fixedLimit; // FIXED mode only: the flat per-window limit
    uint256 tMin;
    uint256 maxStep; // max growth of T per window
    uint256 minActivity; // windows below this are quiet; strikes need at least this much spend
    uint256 slack; // added to the cost ceiling
    uint256 unknownBudget; // U: lifetime budget for payees that aren't approved (0 in FIXED)
    uint64 windowLength;
    uint64 incomeHold; // sales income clears after this, or on buyer acknowledgement
    uint64 strikeCooldown;
    uint64 delay; // loosening delay
    uint64 drawdownPeriod; // high-water mark resets after this (7 days by default)
    uint32 learningWindows;
    uint16 growthBps; // share of profit that grows T
    uint16 carryBps; // share of last window's value that still counts toward the ceiling
}

struct SupplierInit {
    address payee;
    uint128 perPayment;
    uint128 perWindow; // 0 = default (Tmax)
}

struct AcceptorInit {
    address acceptor;
    uint128 perWindow;
}

struct Init {
    IERC20 token;
    Mode mode;
    address owner;
    address guardian;
    address agent;
    address vault;
    Config cfg;
    SupplierInit[] suppliers;
    AcceptorInit[] acceptors;
}

struct ReceiptData {
    bytes32 fp;
    bytes32 billRef;
    address payee;
    uint64 time;
    State state;
    address approvedBy; // the agent, or the owner for payWithApproval
    uint128 amount;
    uint128 limitT;
    uint128 windowValue;
    uint128 windowSpend;
}

struct Snapshot {
    Mode mode;
    State state;
    uint256 limitT;
    uint256 tMax;
    uint256 allowance;
    uint256 pendingTotal;
    uint256 workBudget;
    uint256 runway;
    uint256 reserve;
    uint256 unknownRemaining;
    uint256 costBps;
    uint256 learnedCostShareBps;
    uint256 windowIndex;
    uint256 windowValue;
    uint256 windowSpend;
    uint256 windowEndsAt;
    uint256 strikes;
    uint256 maxLossNow;
    uint256 drawdown;
    uint256 lifetimeValue;
    uint256 lifetimeSpend;
    uint256 receiptCount;
    uint256 balance;
}
