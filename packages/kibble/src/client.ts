import {
  parseEventLogs,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type Log,
  type PublicClient,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import { kibbleDrawerAbi } from "./abi";
import { REASONS, REASON_TEXT, STATES, type ReasonName, type StateName } from "./types";
import { drawerDomain, fingerprint, payApprovalTypes, resumeTypes, workAcceptedTypes } from "./typed-data";

export type Wallet = WalletClient<Transport, Chain, Account>;

/** Aevum's tooling (and its faucet) uses legacy transactions; they work on anvil too. */
const TX = { type: "legacy" } as const;

export type PayResult =
  | { status: "paid"; fp: Hex; receiptId: bigint; txHash: Hex }
  | { status: "refused"; fp: Hex; reason: ReasonName; text: string; txHash: Hex };

export function decodeDrawerLogs(receipt: TransactionReceipt, drawer: Address) {
  return parseEventLogs({
    abi: kibbleDrawerAbi,
    logs: receipt.logs.filter((l) => l.address.toLowerCase() === drawer.toLowerCase()),
  });
}

/** Decode raw drawer logs (from getLogs). Unknown events are skipped. */
export function decodeDrawerLogsFrom(logs: Log[]): { eventName: string; args: Record<string, unknown> }[] {
  return parseEventLogs({ abi: kibbleDrawerAbi, logs }) as unknown as { eventName: string; args: Record<string, unknown> }[];
}

function outcome(receipt: TransactionReceipt, drawer: Address, fp: Hex): PayResult {
  for (const log of decodeDrawerLogs(receipt, drawer)) {
    if (log.eventName === "Paid" && log.args.fp === fp) {
      return { status: "paid", fp, receiptId: log.args.receiptId, txHash: receipt.transactionHash };
    }
    if (log.eventName === "Refused" && log.args.fp === fp) {
      const reason = REASONS[log.args.reason] ?? "None";
      return { status: "refused", fp, reason, text: REASON_TEXT[reason], txHash: receipt.transactionHash };
    }
  }
  throw new Error(`no Paid or Refused event for ${fp} in ${receipt.transactionHash}`);
}

/**
 * Pay exactly once, even under retries (report section 7.9):
 *  - the drawer computes fp = keccak256(payee, amount, billRef) and refuses a used fp;
 *  - on a timeout or a dropped transaction, read usedFingerprint(fp): if paid, it's confirmed;
 *    otherwise resubmit the same billRef. A duplicate is refused, never paid twice.
 */
export async function payOnce(opts: {
  pub: PublicClient;
  wallet: Wallet;
  drawer: Address;
  payee: Address;
  amount: bigint;
  billRef: Hex;
  approval?: { deadline: bigint; ownerSig: Hex };
  tries?: number;
  timeoutMs?: number;
}): Promise<PayResult> {
  const { pub, wallet, drawer, payee, amount, billRef } = opts;
  const fp = fingerprint(payee, amount, billRef);
  const tries = opts.tries ?? 3;
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const hash = opts.approval
        ? await writeDrawer(pub, wallet, drawer, "payWithApproval", [
            payee,
            amount,
            billRef,
            opts.approval.deadline,
            opts.approval.ownerSig,
          ])
        : await writeDrawer(pub, wallet, drawer, "pay", [payee, amount, billRef]);
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout: opts.timeoutMs ?? 60_000 });
      if (receipt.status !== "success") throw new Error(`pay reverted: ${hash}`);
      return outcome(receipt, drawer, fp);
    } catch (err) {
      lastError = err;
      // Did an earlier attempt land after all?
      const used = await pub
        .readContract({ address: drawer, abi: kibbleDrawerAbi, functionName: "usedFingerprint", args: [fp] })
        .catch(() => false);
      if (used) return { status: "paid", fp, receiptId: 0n, txHash: "0x" as Hex };
    }
  }
  throw lastError;
}

/**
 * Estimate, then send with a 2x margin. Any call can close a window, finish learning or clear income in
 * the block it lands in, which the estimate (made against the previous block) doesn't see. Unused gas
 * isn't charged.
 */
export async function writeDrawer(
  pub: PublicClient,
  wallet: Wallet,
  drawer: Address,
  functionName: string,
  args: readonly unknown[] = [],
): Promise<Hex> {
  // viem can't narrow a runtime function name; the ABI still encodes and checks the arguments.
  const req = { address: drawer, abi: kibbleDrawerAbi, functionName, args, account: wallet.account } as never;
  const gas = (await pub.estimateContractGas(req)) * 2n + 100_000n;
  return wallet.writeContract({ ...TX, ...(req as object), gas } as never);
}

export async function sendDrawer(
  pub: PublicClient,
  wallet: Wallet,
  drawer: Address,
  functionName: string,
  args: readonly unknown[] = [],
): Promise<TransactionReceipt> {
  const hash = await writeDrawer(pub, wallet, drawer, functionName, args);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
  return receipt;
}

export async function signPayApproval(
  owner: Wallet,
  drawer: Address,
  msg: { payee: Address; amount: bigint; billRef: Hex; deadline: bigint; nonce: bigint },
): Promise<Hex> {
  return owner.signTypedData({
    domain: drawerDomain(owner.chain.id, drawer),
    types: payApprovalTypes,
    primaryType: "PayApproval",
    message: msg,
  });
}

export async function signWorkAccepted(
  acceptor: Wallet,
  drawer: Address,
  msg: { jobId: Hex; value: bigint; deadline: bigint },
): Promise<Hex> {
  return acceptor.signTypedData({
    domain: drawerDomain(acceptor.chain.id, drawer),
    types: workAcceptedTypes,
    primaryType: "WorkAccepted",
    message: msg,
  });
}

export async function signResume(signer: Wallet, drawer: Address, msg: { nonce: bigint; deadline: bigint }) {
  return signer.signTypedData({
    domain: drawerDomain(signer.chain.id, drawer),
    types: resumeTypes,
    primaryType: "Resume",
    message: msg,
  });
}

export type DrawerView = {
  address: Address;
  mode: "FIXED" | "EARNED";
  state: StateName;
  limitT: bigint;
  tMax: bigint;
  allowance: bigint;
  pendingTotal: bigint;
  workBudget: bigint;
  runway: bigint;
  reserve: bigint;
  unknownRemaining: bigint;
  costBps: bigint;
  learnedCostShareBps: bigint;
  windowIndex: bigint;
  windowValue: bigint;
  windowSpend: bigint;
  windowEndsAt: bigint;
  strikes: bigint;
  maxLossNow: bigint;
  drawdown: bigint;
  lifetimeValue: bigint;
  lifetimeSpend: bigint;
  receiptCount: bigint;
  balance: bigint;
};

export async function readDrawer(pub: PublicClient, drawer: Address): Promise<DrawerView> {
  const s = await pub.readContract({ address: drawer, abi: kibbleDrawerAbi, functionName: "snapshot" });
  return {
    address: drawer,
    ...s,
    mode: s.mode === 0 ? "FIXED" : "EARNED",
    state: STATES[s.state] ?? "Healthy",
  };
}
