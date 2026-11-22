// Mirrors contracts/src/KibbleTypes.sol. Keep the order identical.

export const Mode = { FIXED: 0, EARNED: 1 } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export const STATES = ["Learning", "Healthy", "Watch", "Braked", "Paused", "Revoked"] as const;
export type StateName = (typeof STATES)[number];
export const State = Object.fromEntries(STATES.map((s, i) => [s, i])) as Record<StateName, number>;

export const REASONS = [
  "None",
  "StatePaused",
  "StateRevoked",
  "ZeroAmount",
  "DuplicateBill",
  "NeedsApproval",
  "BadApproval",
  "ApprovalExpired",
  "OverSupplierPayment",
  "OverSupplierWindow",
  "OverUnknownBudget",
  "OverAllowance",
  "OverCeiling",
  "Strike",
  "LossWindow",
  "CleanWindows",
  "Recovery",
  "Drawdown",
  "LearningDone",
  "OwnerFreeze",
  "OwnerResume",
  "OwnerRevoke",
  "UnexplainedOutflow",
] as const;
export type ReasonName = (typeof REASONS)[number];

/** Plain words for every refusal and state change (report: "every error has plain words"). */
export const REASON_TEXT: Record<ReasonName, string> = {
  None: "",
  StatePaused: "Refused: the agent is paused",
  StateRevoked: "Refused: the drawer is revoked",
  ZeroAmount: "Refused: no amount or no payee",
  DuplicateBill: "Refused: this bill was already paid",
  NeedsApproval: "Refused: above the approval threshold, the owner must sign",
  BadApproval: "Refused: the approval signature isn't the owner's",
  ApprovalExpired: "Refused: the owner's approval expired",
  OverSupplierPayment: "Refused: over this supplier's per-payment cap",
  OverSupplierWindow: "Refused: over this supplier's cap for the window",
  OverUnknownBudget: "Refused: not an approved payee, and no stranger budget is left",
  OverAllowance: "Refused: over the allowance the agent has earned",
  OverCeiling: "Refused: over the cost ceiling (spend too high for the value earned)",
  Strike: "Strike: spending ran above the agent's normal cost share",
  LossWindow: "A window closed at a loss",
  CleanWindows: "Two clean windows: back to Healthy",
  Recovery: "A profitable window while braked: recovering",
  Drawdown: "Losses over the week passed the owner's limit",
  LearningDone: "Learning finished: cost share calibrated",
  OwnerFreeze: "The owner or guardian froze the agent",
  OwnerResume: "The owner resumed the agent",
  OwnerRevoke: "The owner revoked the drawer",
  UnexplainedOutflow: "Tokens left the drawer without a payment: paused",
};

export const PARAMS = [
  "T",
  "TMax",
  "TMin",
  "CostBps",
  "ApprovalThreshold",
  "UnknownBudget",
  "MaxWeeklyLoss",
  "GrowthBps",
  "MaxStep",
  "Slack",
  "CarryBps",
  "MinActivity",
] as const;
export const Param = Object.fromEntries(PARAMS.map((p, i) => [p, i])) as Record<(typeof PARAMS)[number], number>;

export const ACTIONS = ["AddSupplier", "AddAcceptor", "RaiseParam", "Resume", "SetAgent", "SetGuardian"] as const;
export const Action = Object.fromEntries(ACTIONS.map((a, i) => [a, i])) as Record<(typeof ACTIONS)[number], number>;

export const WINDOW_KINDS = ["Quiet", "Loss", "Profit", "Even"] as const;

export const TUSD8_DECIMALS = 6;

/** 1.23 -> 1230000n */
export function units(amount: number | string): bigint {
  const [whole, frac = ""] = String(amount).split(".");
  return BigInt(whole) * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
}

/** 1230000n -> "1.23" */
export function fmt(value: bigint, digits = 2): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, digits);
  return `${neg ? "-" : ""}${whole}${digits > 0 ? "." + frac : ""}`;
}
