"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import type { DrawerView } from "@kibble/sdk";
import { Arrow, EASE, Num, PageHead, Reveal, SecHead, StatePill } from "@/components/ui";
import { AGENTS, PAIRS, amt, pct, short, useDeployment, useDrawerHistory, useDrawers, type AgentName, type Deployment } from "@/lib/kibble";
import { useNetwork } from "@/lib/network";
import { whyState } from "@/lib/plain";
import { Term } from "@/components/Term";

const PAIR_COPY: Record<string, { title: string; note: string }> = {
  A: { title: "Same sales, *different* limits.", note: "The same business twice. One has a fixed limit. The other earns its limit." },
  B: { title: "A losing strategy, *braked.*", note: "Both sell for less than they pay. Only one of them is stopped." },
};

/** Split screen: fixed limit on the left, Kibble on the right, the same contract code and traffic. */
export default function DashboardPage() {
  const { net } = useNetwork();
  const dep = useDeployment();
  const live = useDrawers(dep.data);

  const head = (
    <PageHead
      n="K—02"
      rail={`Live desk · ${net.chain.name} · chain ${net.chain.id}`}
      eyebrow={`Live on ${net.chain.name}`}
      live
      title="A fixed limit is a *guess.* Kibble's is earned."
      lede="These agents run on Aevum testnet right now. Fixed limit on the left, Kibble on the right: the same code and the same customers."
      aside={
        <Link href="/playground" className="btn">
          Run one yourself <Arrow />
        </Link>
      }
    />
  );

  if (dep.isLoading)
    return (
      <main className="shell">
        {head}
        <p className="fine">Loading the deployment…</p>
      </main>
    );
  if (!dep.data) {
    return (
      <main className="shell">
        {head}
        <div className="card">
          <p>
            No Kibble demo is deployed on <strong>{net.chain.name}</strong> yet. Run <code>pnpm --filter @kibble/agents setup-demo</code> with
            <code> RPC_URL</code> pointing at this network.
          </p>
        </div>
      </main>
    );
  }
  const d = dep.data;
  const drawers = live.data?.drawers ?? {};
  const receipts = Object.values(drawers).reduce((t, v) => t + Number(v?.receiptCount ?? 0n), 0);

  return (
    <main className="shell">
      {head}

      <Reveal className="livebar" y={10}>
        <span className="livebar-tag">
          <span className="pulse live" aria-hidden="true" /> Live
        </span>
        <span>
          Profit in the owner&apos;s vault <b>{amt(live.data?.vault)}</b> tUSD8
        </span>
        <span>
          <b>{live.data ? receipts : "…"}</b> payments made
        </span>
        <span>
          <b>{Object.keys(d.drawers).length}</b> agents
        </span>
        <motion.span key={live.dataUpdatedAt} className="tick" initial={{ color: "#ffb000" }} animate={{ color: "#9a92a3" }} transition={{ duration: 1.2 }}>
          synced {live.dataUpdatedAt ? new Date(live.dataUpdatedAt).toLocaleTimeString() : "…"}
        </motion.span>
      </Reveal>

      <section className="stack">
        <SecHead n="00" title="How they're *doing.*" note="Read from the chain every few seconds. Amounts are test money (tUSD8)." />
        <Scoreboard dep={d} drawers={drawers} vault={live.data?.vault} />
      </section>

      {PAIRS.map(([fixed, kibble], i) => (
        <section key={kibble} className="stack">
          <SecHead n={`0${i + 1}`} title={PAIR_COPY[kibble]?.title ?? AGENTS[kibble].label} note={PAIR_COPY[kibble]?.note} />
          <div className="vs">
            <Reveal>
              <AgentCard name={fixed} dep={d} v={drawers[fixed]} />
            </Reveal>
            <div className="vs-mid" aria-hidden="true">
              <span>vs</span>
            </div>
            <Reveal delay={0.12}>
              <AgentCard name={kibble} dep={d} v={drawers[kibble]} />
            </Reveal>
          </div>
          <Reveal>
            <TimeLapse left={fixed} right={kibble} dep={d} />
          </Reveal>
        </section>
      ))}

      <section className="stack">
        <SecHead n="03" title="Paid by *accepted* work." note="This one sells nothing. It earns when a client signs that its report is good." />
        <Reveal>
          <AgentCard name="W" dep={d} v={drawers.W} />
        </Reveal>
      </section>
      {live.error && <p className="fine">Couldn&apos;t read the drawers: {String(live.error)}</p>}
    </main>
  );
}

function Scoreboard({ dep, drawers, vault }: { dep: Deployment; drawers: Partial<Record<AgentName, DrawerView>>; vault?: bigint }) {
  const names = Object.keys(dep.drawers) as AgentName[];
  return (
    <Reveal className="card flush">
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
        <table className="docs-table mono-cells">
          <thead>
            <tr>
              <th>Agent</th>
              <th>State</th>
              <th>Why</th>
              <th>Limit</th>
              <th>Earned</th>
              <th>Spent</th>
              <th>Profit</th>
              <th>A thief could take</th>
            </tr>
          </thead>
          <tbody>
            {names.map((n) => {
              const v = drawers[n];
              const profit = v ? v.lifetimeValue - v.lifetimeSpend : undefined;
              return (
                <tr key={n}>
                  <td style={{ fontFamily: "var(--sans)", fontSize: 14 }}>
                    <Link href={`/drawer/${dep.drawers[n]}`}>{AGENTS[n].label}</Link>
                  </td>
                  <td>
                    <StatePill state={v?.state} />
                  </td>
                  <td className="why-cell">{v ? whyState(v) : "…"}</td>
                  <td>{amt(v?.limitT)}</td>
                  <td>{amt(v?.lifetimeValue)}</td>
                  <td>{amt(v?.lifetimeSpend)}</td>
                  <td style={{ color: profit === undefined ? undefined : profit < 0n ? "var(--coral)" : "var(--mint)" }}>{amt(profit)}</td>
                  <td>{amt(v?.maxLossNow)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fine" style={{ padding: "14px clamp(18px, 2vw, 28px) 18px", borderTop: "1px solid var(--line)" }}>
        Profit is moved to the owner&apos;s vault ({short(dep.vault)}), now <strong>{amt(vault)} tUSD8</strong>. The agents&apos; keys can never reach it. <Link href="/agents">See every agent</Link>.
      </p>
    </Reveal>
  );
}

function AgentCard({ name, dep, v }: { name: AgentName; dep: Deployment; v?: DrawerView }) {
  const meta = AGENTS[name];
  const addr = dep.drawers[name];
  const earned = meta.mode === "EARNED";
  const paused = v?.state === "Paused" || v?.state === "Revoked";
  const share = v && v.tMax > 0n ? Math.min(100, Number((v.limitT * 10000n) / v.tMax) / 100) : 0;
  return (
    <article className={`card agent ${earned ? "kibble" : ""} ${paused ? "danger" : ""}`}>
      <div className="agent-top">
        <div>
          <p className="agent-mode">
            <i aria-hidden="true" /> {earned ? "Kibble" : "Fixed limit"}
          </p>
          <h2>
            <Link href={`/drawer/${addr}`}>{meta.label}</Link>
          </h2>
        </div>
        <StatePill state={v?.state} />
      </div>
      <p className="agent-about">{meta.about}</p>
      {v && <p className={`why ${v.state}`}>{whyState(v)}</p>}

      <div className="agent-nums">
        <div>
          <span className="stat-label">
            <Term k="limit" />
          </span>
          <Num className={`big ${paused ? "coral" : ""}`} value={v ? amt(v.limitT) : undefined} />
        </div>
        <div>
          <span className="stat-label">
            <Term k="exposure" />
          </span>
          <Num className={`big mid ${v && v.maxLossNow === 0n ? "mint" : ""}`} value={v ? amt(v.maxLossNow) : undefined} />
        </div>
      </div>

      {earned && v && (
        <div className="stack" style={{ gap: 8 }}>
          <div className={`meter ${paused ? "coral" : ""}`}>
            <span style={{ width: `${share}%` }} />
          </div>
          <p className="fine">
            It can grow to {amt(v.tMax)}
            {v.strikes > 0n && ` · ${v.strikes} strike${v.strikes === 1n ? "" : "s"}`}
          </p>
        </div>
      )}

      <details>
        <summary>All numbers</summary>
        {!v ? (
          <p className="fine">Reading…</p>
        ) : (
          <dl className="kv">
            <dt>Can spend now</dt>
            <dd>{amt(v.allowance)}</dd>
            <dt>A thief could take (maxLossNow)</dt>
            <dd>
              <strong>{amt(v.maxLossNow)}</strong>
            </dd>
            {earned && (
              <>
                <dt>Cost ceiling</dt>
                <dd>
                  {pct(v.costBps)} of value{v.learnedCostShareBps > 0n && ` (learned ${pct(v.learnedCostShareBps)})`}
                </dd>
              </>
            )}
            <dt>This round</dt>
            <dd>
              #{v.windowIndex.toString()}: value {amt(v.windowValue)}, spent {amt(v.windowSpend)}
            </dd>
            {v.pendingTotal > 0n && (
              <>
                <dt>Sales not confirmed yet</dt>
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
                <dt>Advance from the owner</dt>
                <dd>{amt(v.runway)}</dd>
              </>
            )}
            {!earned && (
              <>
                <dt>Reserve</dt>
                <dd>{amt(v.reserve)}</dd>
              </>
            )}
          </dl>
        )}
      </details>
    </article>
  );
}

/** Collapsed by default; the log scan only starts when it's opened. */
function TimeLapse(props: { left: AgentName; right: AgentName; dep: Deployment }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="card" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span>
          <span className="card-label" style={{ display: "block", marginBottom: 6 }}>
            Round by round
          </span>
          {AGENTS[props.left].label} vs {AGENTS[props.right].label}
        </span>
      </summary>
      {open && <TimeLapseBody {...props} />}
    </details>
  );
}

/** The two sides' windows next to each other, from their TrackRecord events. */
function TimeLapseBody({ left, right, dep }: { left: AgentName; right: AgentName; dep: Deployment }) {
  const reduce = useReducedMotion();
  const from = BigInt(dep.deployBlock);
  const l = useDrawerHistory(dep.drawers[left], from);
  const r = useDrawerHistory(dep.drawers[right], from);
  const lw = l.data?.windows ?? [];
  const rw = r.data?.windows ?? [];
  const rows = Math.max(lw.length, rw.length);
  if (rows === 0) {
    return <p className="fine">{l.isLoading || r.isLoading ? "Reading the history…" : "No finished rounds in the last 5 hours or so."}</p>;
  }
  const maxT = [...lw, ...rw].reduce((m, w) => (w.limitT > m ? w.limitT : m), 1n);
  const W = Math.max(rows - 1, 1) * 10;
  const pts = (ws: typeof lw) => ws.map((w, k) => `${k * 10},${48 - Number((w.limitT * 44n) / maxT)}`).join(" ");
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} 50`} preserveAspectRatio="none" aria-label="Limit per window: dashed fixed, solid Kibble">
        {[12, 24, 36, 48].map((y) => (
          <line key={y} className="grid" x1={0} x2={W} y1={y} y2={y} vectorEffect="non-scaling-stroke" />
        ))}
        {[lw, rw].map((ws, i) => (
          <motion.polyline
            key={i}
            className={i === 0 ? "fixed" : "kibble"}
            fill="none"
            strokeWidth={i === 0 ? 1.5 : 2}
            vectorEffect="non-scaling-stroke"
            points={pts(ws)}
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, delay: i * 0.25, ease: EASE }}
          />
        ))}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="dash" /> {AGENTS[left].label}
        </span>
        <span>
          <i /> {AGENTS[right].label}
        </span>
        <span>{rows} closed windows, last ~5 hours</span>
      </div>
      <div className="table-wrap" style={{ marginTop: 18 }}>
        <table className="docs-table mono-cells">
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
                  <td>{a && <StatePill state={a.state} />}</td>
                  <td>{b ? `${amt(b.value)} / ${amt(b.spend)}` : ""}</td>
                  <td>{b ? amt(b.limitT) : ""}</td>
                  <td>{b && <StatePill state={b.state} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
