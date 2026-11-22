"use client";

import Link from "next/link";
import type { DrawerView } from "@kibble/sdk";
import { AGENTS, PAIRS, amt, pct, short, useDeployment, useDrawerHistory, useDrawers, type AgentName, type Deployment } from "@/lib/kibble";
import { useNetwork } from "@/lib/network";

/** Split screen: fixed limit on the left, Kibble on the right, the same contract code and traffic. */
export default function DashboardPage() {
  const { net } = useNetwork();
  const dep = useDeployment();
  const live = useDrawers(dep.data);

  if (dep.isLoading) return <Shell><p className="fine">Loading the deployment…</p></Shell>;
  if (!dep.data) {
    return (
      <Shell>
        <div className="card">
          <p>
            No Kibble demo is deployed on <strong>{net.chain.name}</strong> yet. Run <code>pnpm --filter @kibble/agents setup-demo</code> with
            <code> RPC_URL</code> pointing at this network.
          </p>
        </div>
      </Shell>
    );
  }
  const d = dep.data;
  const drawers = live.data?.drawers ?? {};

  return (
    <Shell>
      <Scoreboard dep={d} drawers={drawers} vault={live.data?.vault} />
      {PAIRS.map(([fixed, kibble]) => (
        <section key={kibble} className="stack">
          <div className="grid-2">
            <DrawerCard name={fixed} dep={d} v={drawers[fixed]} />
            <DrawerCard name={kibble} dep={d} v={drawers[kibble]} />
          </div>
          <TimeLapse left={fixed} right={kibble} dep={d} />
        </section>
      ))}
      <section className="stack">
        <DrawerCard name="W" dep={d} v={drawers.W} />
      </section>
      {live.error && <p className="fine">Couldn&apos;t read the drawers: {String(live.error)}</p>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="shell stack">
      <div className="page-head">
        <p className="eyebrow">Kibble</p>
        <h1>A fixed limit is a guess. Kibble&apos;s limit is earned.</h1>
        <p className="lede">
          Each agent spends from its own drawer contract. Fixed on the left, Kibble on the right: the same code and the same traffic. The
          wallet brakes the agent when spending stops paying for itself.
        </p>
      </div>
      {children}
    </main>
  );
}

function Scoreboard({ dep, drawers, vault }: { dep: Deployment; drawers: Partial<Record<AgentName, DrawerView>>; vault?: bigint }) {
  const names = Object.keys(dep.drawers) as AgentName[];
  return (
    <div className="card flush">
      <div className="table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>State</th>
              <th>Limit T</th>
              <th>Value earned</th>
              <th>Spent</th>
              <th>Profit</th>
              <th title="The most a stolen agent key could take right now">Hijack exposure</th>
              <th>Receipts</th>
            </tr>
          </thead>
          <tbody>
            {names.map((n) => {
              const v = drawers[n];
              return (
                <tr key={n}>
                  <td>
                    <Link href={`/drawer/${dep.drawers[n]}`}>{AGENTS[n].label}</Link>
                  </td>
                  <td>
                    <span className="pill">{v?.state ?? "…"}</span>
                  </td>
                  <td>{amt(v?.limitT)}</td>
                  <td>{amt(v?.lifetimeValue)}</td>
                  <td>{amt(v?.lifetimeSpend)}</td>
                  <td>{v ? amt(v.lifetimeValue - v.lifetimeSpend) : "…"}</td>
                  <td>{amt(v?.maxLossNow)}</td>
                  <td>{v?.receiptCount.toString() ?? "…"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fine">
        Owner vault {short(dep.vault)} holds <strong>{amt(vault)} tUSD8</strong> of swept profit. The agent keys can never reach it.
      </p>
    </div>
  );
}

function DrawerCard({ name, dep, v }: { name: AgentName; dep: Deployment; v?: DrawerView }) {
  const meta = AGENTS[name];
  const addr = dep.drawers[name];
  return (
    <div className="card">
      <p className="eyebrow">{meta.mode === "FIXED" ? "Fixed limit (with alerts)" : "Kibble"}</p>
      <h2>
        <Link href={`/drawer/${addr}`}>{meta.label}</Link>
      </h2>
      <p className="fine">{meta.about}</p>
      {!v ? (
        <p className="fine">Reading…</p>
      ) : (
        <dl className="kv">
          <dt>State</dt>
          <dd>
            <span className="pill">{v.state}</span> {v.strikes > 0n && `${v.strikes} strike${v.strikes === 1n ? "" : "s"}`}
          </dd>
          <dt>{meta.mode === "FIXED" ? "Flat limit" : "Earned limit T"}</dt>
          <dd>
            {amt(v.limitT)} {meta.mode === "EARNED" && <span className="fine">(max {amt(v.tMax)})</span>}
          </dd>
          <dt>Allowance left</dt>
          <dd>{amt(v.allowance)}</dd>
          <dt>Hijack exposure (maxLossNow)</dt>
          <dd>
            <strong>{amt(v.maxLossNow)}</strong>
          </dd>
          {meta.mode === "EARNED" && (
            <>
              <dt>Cost ceiling</dt>
              <dd>
                {pct(v.costBps)} of value{v.learnedCostShareBps > 0n && <span className="fine"> (learned cost share {pct(v.learnedCostShareBps)})</span>}
              </dd>
            </>
          )}
          <dt>This window</dt>
          <dd>
            #{v.windowIndex.toString()}: value {amt(v.windowValue)}, spent {amt(v.windowSpend)}
          </dd>
          {v.pendingTotal > 0n && (
            <>
              <dt>Income not yet cleared</dt>
              <dd>{amt(v.pendingTotal)}</dd>
            </>
          )}
          {v.workBudget > 0n && (
            <>
              <dt>Work budget</dt>
              <dd>{amt(v.workBudget)}</dd>
            </>
          )}
          {v.runway > 0n && (
            <>
              <dt>Runway grant</dt>
              <dd>{amt(v.runway)}</dd>
            </>
          )}
          {meta.mode === "FIXED" && (
            <>
              <dt>Reserve</dt>
              <dd>{amt(v.reserve)}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

/** The two sides' windows next to each other, from their TrackRecord events. */
function TimeLapse({ left, right, dep }: { left: AgentName; right: AgentName; dep: Deployment }) {
  const from = BigInt(dep.deployBlock);
  const l = useDrawerHistory(dep.drawers[left], from);
  const r = useDrawerHistory(dep.drawers[right], from);
  const lw = l.data?.windows ?? [];
  const rw = r.data?.windows ?? [];
  const rows = Math.max(lw.length, rw.length);
  if (rows === 0) {
    return <p className="fine">{l.isLoading || r.isLoading ? "Reading the window history…" : "No closed windows in the last ~5 hours."}</p>;
  }
  const maxT = [...lw, ...rw].reduce((m, w) => (w.limitT > m ? w.limitT : m), 1n);
  return (
    <details className="card">
      <summary>
        Time-lapse: {rows} windows, {AGENTS[left].label} vs {AGENTS[right].label}
      </summary>
      <svg viewBox={`0 0 ${Math.max(rows - 1, 1) * 10} 50`} width="100%" height="80" preserveAspectRatio="none" aria-label="Limit per window">
        {[lw, rw].map((ws, i) => (
          <polyline
            key={i}
            fill="none"
            stroke="currentColor"
            strokeDasharray={i === 0 ? "2 2" : undefined}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            points={ws.map((w, k) => `${k * 10},${50 - Number((w.limitT * 48n) / maxT)}`).join(" ")}
          />
        ))}
      </svg>
      <p className="fine">Limit per window: dashed = fixed, solid = Kibble.</p>
      <div className="table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Window</th>
              <th>Fixed: value / spent</th>
              <th>Fixed: state</th>
              <th>Kibble: value / spent</th>
              <th>Kibble: T</th>
              <th>Kibble: state</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, k) => {
              const a = lw[k];
              const b = rw[k];
              return (
                <tr key={k}>
                  <td>{k + 1}</td>
                  <td>{a ? `${amt(a.value)} / ${amt(a.spend)}` : ""}</td>
                  <td>{a?.state}</td>
                  <td>{b ? `${amt(b.value)} / ${amt(b.spend)}` : ""}</td>
                  <td>{b ? amt(b.limitT) : ""}</td>
                  <td>{b?.state}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
