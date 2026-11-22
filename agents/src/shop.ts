import { type Address, type Hex } from "viem";
import { kibbleDrawerAbi, newBillRef, payOnce, sendDrawer, type PayResult } from "@kibble/sdk";
import type { Ctx, Role } from "./chain";
import { runModelCall, verifyPaid } from "./supplier";

export type SaleResult =
  | { status: "served"; pay: PayResult }
  | { status: "turned-away"; why: string };

/**
 * One customer order, the way a selling agent handles it:
 *  1. the buyer pays the drawer for `billRef` (pending income);
 *  2. the agent buys its input from the supplier through the drawer (seller settles before buying);
 *  3. the supplier checks the Paid event and runs the call; the agent delivers;
 *  4. the buyer acknowledges delivery, which clears the income as value.
 * If the drawer refuses the purchase, the agent refunds the buyer from pending income.
 */
export async function handleSale(
  ctx: Ctx,
  opts: { drawer: Address; agentRole: Role; price: bigint; cost: bigint; prompt?: string },
): Promise<SaleResult> {
  const { drawer, price, cost } = opts;
  const billRef = newBillRef("sale");
  const supplier = ctx.address("SUPPLIER");
  try {
    await sendDrawer(ctx.pub, ctx.wallet("BUYER"), drawer, "buy", [billRef, price]);
  } catch {
    return { status: "turned-away", why: "drawer not taking orders (paused)" };
  }
  const pay = await payOnce({ pub: ctx.pub, wallet: ctx.wallet(opts.agentRole), drawer, payee: supplier, amount: cost, billRef });
  if (pay.status !== "paid") {
    await sendDrawer(ctx.pub, ctx.wallet(opts.agentRole), drawer, "refund", [billRef]).catch(() => undefined);
    return { status: "turned-away", why: pay.text };
  }
  const ok = await verifyPaid(ctx, { txHash: pay.txHash, drawer, billRef, amount: cost, supplier });
  if (!ok) throw new Error(`supplier could not verify payment for ${billRef}`);
  runModelCall(opts.prompt ?? "customer document");
  await sendDrawer(ctx.pub, ctx.wallet("BUYER"), drawer, "ackDelivery", [billRef]);
  return { status: "served", pay };
}

/** A plain agent purchase (no sale behind it): the hijack and bad-strategy beats use this. */
export async function agentPay(ctx: Ctx, opts: { drawer: Address; agentRole: Role; payee: Address; amount: bigint; billRef?: Hex }) {
  return payOnce({
    pub: ctx.pub,
    wallet: ctx.wallet(opts.agentRole),
    drawer: opts.drawer,
    payee: opts.payee,
    amount: opts.amount,
    billRef: opts.billRef ?? newBillRef("buy"),
  });
}

export async function sync(ctx: Ctx, drawer: Address) {
  await sendDrawer(ctx.pub, ctx.wallet("RELAYER"), drawer, "sync");
}

export async function windowEndsAt(ctx: Ctx, drawer: Address): Promise<bigint> {
  const [start, len] = await Promise.all([
    ctx.pub.readContract({ address: drawer, abi: kibbleDrawerAbi, functionName: "windowStart" }),
    ctx.pub.readContract({ address: drawer, abi: kibbleDrawerAbi, functionName: "windowLength" }),
  ]);
  return BigInt(start) + BigInt(len);
}
