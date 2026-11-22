import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/** Kibble's custom errors (contracts/src/KibbleCore.sol, KibbleVault.sol) in plain words. */
const KIBBLE_ERRORS: Record<string, string> = {
  NotAgent: "Only the drawer's agent key can do this.",
  NotOwner: "Only the owner can do this. Connect the owner's wallet.",
  NotOwnerOrGuardian: "Only the owner or the guardian can do this.",
  NotOwnerOrHome: "Only the vault owner or its home address can do this.",
  NotTighter: "That would loosen the setting. Tightening is instant; loosening goes through the queue.",
  Inactive: "The drawer is paused or revoked.",
  WrongMode: "This only works on a Kibble (earned) drawer.",
  OverRoom: "Too much: a runway can't exceed the max weekly loss, and it must end in the future.",
  NotReady: "The waiting period for this action hasn't passed yet.",
  NotQueued: "There's no queued action with that id (or it already ran or was cancelled).",
  GuardianCannotCancel: "The guardian can't cancel a guardian change.",
  NothingToResume: "The drawer isn't paused or braked, so there's nothing to resume.",
  Expired: "The signature expired. Sign again.",
  BadSignature: "The signatures don't match the owner and the guardian, or the nonce changed. Sign again.",
  ZeroAddress: "An address is missing.",
  BadConfig: "Those settings aren't allowed.",
  AlreadyDone: "That withdrawal already ran or was cancelled.",
  UnknownWithdrawal: "There's no withdrawal with that id.",
};

/** Turns wallet / RPC / revert errors into one sentence a user can act on. */
export function explain(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong. Try again.";
  // MetaMask won't add a network whose RPC URL another saved network already uses.
  const dup = /same RPC endpoint as existing network for chain \w+ \('([^']*)'\)/.exec(fullMessage(error));
  if (dup) return `Your wallet already has a network ("${dup[1]}") using the same RPC address. Edit or remove that network in your wallet, then try again.`;
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet. Nothing was sent.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && KIBBLE_ERRORS[name]) return KIBBLE_ERRORS[name];
      const reason = revert.reason ?? "";
      if (/exceeds balance|insufficient/i.test(reason)) return "Not enough tUSD8 in your wallet.";
      if (/allowance/i.test(reason)) return "Approve tUSD8 for the drawer first.";
      if (reason) return reason;
    }
    if (/insufficient funds/i.test(error.message)) return "Not enough tQDAY for gas. Get some from the faucet.";
    return error.shortMessage;
  }
  return error.message;
}

/** Wallet errors often hide the real reason in `cause` or `data.cause`. */
function fullMessage(error: unknown, depth = 0): string {
  if (!error || typeof error !== "object" || depth > 5) return "";
  const e = error as { message?: unknown; details?: unknown; cause?: unknown; data?: { cause?: unknown; message?: unknown } };
  return [e.message, e.details, e.data?.message, fullMessage(e.cause, depth + 1), fullMessage(e.data?.cause, depth + 1)]
    .filter((m) => typeof m === "string" && m)
    .join(" | ");
}
