import { type Address, type Hex } from "viem";
import { decodeDrawerLogs, fingerprint } from "@kibble/sdk";
import type { Ctx } from "./chain";

/**
 * Kibble's own supplier: a paid "AI call". tUSD8 is paid by the drawer with a direct `pay()`, and the
 * supplier delivers only after it sees a matching `Paid(fp, payee=supplier, amount)` event in the
 * transaction. That replaces an x402 facilitator, which Aevum doesn't run.
 */
export async function verifyPaid(
  ctx: Ctx,
  opts: { txHash: Hex; drawer: Address; billRef: Hex; amount: bigint; supplier: Address },
): Promise<boolean> {
  const receipt = await ctx.pub.getTransactionReceipt({ hash: opts.txHash }).catch(() => undefined);
  if (!receipt || receipt.status !== "success") return false;
  const fp = fingerprint(opts.supplier, opts.amount, opts.billRef);
  return decodeDrawerLogs(receipt, opts.drawer).some(
    (l) =>
      l.eventName === "Paid" &&
      l.args.fp === fp &&
      l.args.payee.toLowerCase() === opts.supplier.toLowerCase() &&
      l.args.amount === opts.amount,
  );
}

/** The service itself. Deterministic, so demo runs are reproducible. */
export function runModelCall(prompt: string): string {
  const words = prompt.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
  return `Summary (${words.length} words in): ${words.slice(0, 12).join(" ")}…`;
}
