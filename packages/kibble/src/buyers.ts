// Who actually paid this drawer? An owner can buy from their own agent, so earnings alone prove nothing.
import { zeroAddress, type Address, type PublicClient } from "viem";
import { kibbleDrawerAbi } from "./abi";

const REFUNDED = 3;

export type BuyerStats = {
  /** Sales looked at (the latest ones), and how many there have ever been. */
  sales: number;
  totalSales: number;
  /** Distinct paying addresses. Plain transfers have no known sender. */
  buyers: number;
  /** Share of the money from the biggest buyer, 0 to 1. */
  topShare: number;
  topBuyer: Address | null;
  /** Share of the money paid by the owner, guardian or agent key themselves, 0 to 1. */
  insiderShare: number;
  /** Share that arrived as a plain transfer, so nobody can say who paid, 0 to 1. */
  unknownShare: number;
  refunded: number;
};

/** Read the latest sales from the drawer's storage (no log scanning). */
export async function buyerStats(pub: PublicClient, drawer: Address, limit = 100): Promise<BuyerStats> {
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    pub.readContract({ address: drawer, abi: kibbleDrawerAbi, functionName, args } as never) as Promise<T>;
  const [tail, owner, guardian, agent] = await Promise.all([read<bigint>("pendTail"), read<Address>("owner"), read<Address>("guardian"), read<Address>("agent")]);
  const total = Number(tail);
  const insiders = new Set([owner, guardian, agent].map((a) => a.toLowerCase()));
  const ids = Array.from({ length: Math.min(total, limit) }, (_, i) => total - 1 - i);
  const rows: { payer: Address; status: number; amount: bigint }[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const batch = await Promise.all(ids.slice(i, i + 20).map((id) => read<readonly [Address, number, bigint, bigint, string]>("pendings", [BigInt(id)])));
    rows.push(...batch.map(([payer, status, , amount]) => ({ payer, status: Number(status), amount: BigInt(amount) })));
  }
  return summarizeBuyers(rows, total, insiders);
}

export function summarizeBuyers(rows: { payer: Address; status: number; amount: bigint }[], totalSales: number, insiders: Set<string>): BuyerStats {
  const kept = rows.filter((r) => r.status !== REFUNDED);
  const by = new Map<string, bigint>();
  let sum = 0n;
  for (const r of kept) {
    by.set(r.payer.toLowerCase(), (by.get(r.payer.toLowerCase()) ?? 0n) + r.amount);
    sum += r.amount;
  }
  const share = (v: bigint) => (sum > 0n ? Number((v * 10_000n) / sum) / 10_000 : 0);
  const known = [...by.entries()].filter(([a]) => a !== zeroAddress).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  return {
    sales: rows.length,
    totalSales,
    buyers: known.length,
    topShare: known.length ? share(known[0][1]) : 0,
    topBuyer: known.length ? (known[0][0] as Address) : null,
    insiderShare: share(known.filter(([a]) => insiders.has(a)).reduce((s, [, v]) => s + v, 0n)),
    unknownShare: share(by.get(zeroAddress) ?? 0n),
    refunded: rows.length - kept.length,
  };
}
