"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { Address } from "viem";
import { kibbleDrawerAbi, kibbleFactoryAbi, readDrawer } from "@kibble/sdk";
import { Num, PageHead, Reveal, SecHead, StatePill } from "@/components/ui";
import { explain } from "@/lib/errors";
import { amt, short, useDeployment, usePub } from "@/lib/kibble";

const MAX = 60;

/** Every drawer the factory has made, newest first. Ours are marked: they aren't outside use. */
export default function AgentsPage() {
  const dep = useDeployment();
  const pub = usePub();
  const list = useQuery({
    queryKey: ["all-drawers", dep.data?.factory],
    enabled: Boolean(pub && dep.data),
    refetchInterval: 30_000,
    queryFn: async () => {
      const factory = dep.data!.factory;
      const n = Number(await pub!.readContract({ address: factory, abi: kibbleFactoryAbi, functionName: "drawerCount" }));
      const ids = Array.from({ length: Math.min(n, MAX) }, (_, i) => n - 1 - i);
      const rows = await Promise.all(
        ids.map(async (i) => {
          const address = (await pub!.readContract({ address: factory, abi: kibbleFactoryAbi, functionName: "drawers", args: [BigInt(i)] })) as Address;
          const [v, owner] = await Promise.all([
            readDrawer(pub!, address),
            pub!.readContract({ address, abi: kibbleDrawerAbi, functionName: "owner" }) as Promise<Address>,
          ]);
          return { i, address, v, owner };
        }),
      );
      const ours = new Set(Object.values(dep.data!.roles).map((a) => a.toLowerCase()));
      return { total: n, rows: rows.map((r) => ({ ...r, demo: ours.has(r.owner.toLowerCase()) })) };
    },
  });
  const rows = list.data?.rows ?? [];
  const outside = rows.filter((r) => !r.demo);

  return (
    <main className="shell">
      <PageHead
        n="K—06"
        rail="Agents on Kibble"
        eyebrow="Read from the factory"
        live
        title="Every agent, in the *open.*"
        lede="Each drawer's earnings, spending and state, straight from the chain. Drawers owned by Kibble's own demo wallets are marked as demos."
        aside={
          <Link className="btn" href="/connect">
            Connect yours
          </Link>
        }
      />
      <Reveal className="stats">
        <div className="stat">
          <span className="stat-label">Drawers</span>
          <Num className="big" value={list.data ? String(list.data.total) : undefined} />
          <span className="stat-sub">made by this factory</span>
        </div>
        <div className="stat">
          <span className="stat-label">Not ours</span>
          <Num className="big mid" value={list.data ? String(outside.length) : undefined} />
          <span className="stat-sub">owned by other wallets</span>
        </div>
        <div className="stat">
          <span className="stat-label">Owners</span>
          <Num className="big mid" value={list.data ? String(new Set(rows.map((r) => r.owner)).size) : undefined} />
          <span className="stat-sub">distinct wallets</span>
        </div>
      </Reveal>
      <section className="stack">
        <SecHead n="01" title="All *drawers.*" note={list.data && list.data.total > MAX ? `The newest ${MAX}.` : "Newest first."} />
        <Reveal className="card flush">
          {rows.length ? (
            <div className="table-wrap">
              <table className="docs-table mono-cells">
                <thead>
                  <tr>
                    <th>Drawer</th>
                    <th>Owner</th>
                    <th>Mode</th>
                    <th>State</th>
                    <th>Limit</th>
                    <th>Earned</th>
                    <th>Spent</th>
                    <th>Payments</th>
                    <th>Exposed now</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.address}>
                      <td>
                        <Link href={`/drawer/${r.address}`}>{short(r.address)}</Link>
                      </td>
                      <td>{r.demo ? "Kibble demo" : short(r.owner)}</td>
                      <td>{r.v.mode === "FIXED" ? "Fixed" : "Earned"}</td>
                      <td>
                        <StatePill state={r.v.state} />
                      </td>
                      <td>{amt(r.v.limitT)}</td>
                      <td>{amt(r.v.lifetimeValue)}</td>
                      <td>{amt(r.v.lifetimeSpend)}</td>
                      <td>{r.v.receiptCount.toString()}</td>
                      <td>{amt(r.v.maxLossNow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="fine">{list.error ? explain(list.error) : list.isLoading ? "Reading…" : "No drawers yet."}</p>
          )}
        </Reveal>
        <p className="fine">
          Earnings show that tUSD8 arrived and cleared, not who sent it: an owner can buy from their own agent. Read them as on-chain history,
          not proof of customers.
        </p>
      </section>
    </main>
  );
}
