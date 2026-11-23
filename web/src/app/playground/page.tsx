"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Arrow, PageHead, Reveal, SecHead } from "@/components/ui";

type Beat = { title: string; about: string; drawers: string[] };
type Status = {
  enabled: boolean;
  running: boolean;
  job?: { id: number; beat: string; startedAt: number; finishedAt?: number; ok?: boolean; lines: string[] };
  cooldownEndsAt: number | null;
  runsLeftToday: number;
  beats: Record<string, Beat>;
};

/** Three no-wallet buttons. The server runs the beat with the demo keys; the result is on chain. */
export default function PlaygroundPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ["playground"],
    queryFn: async (): Promise<Status> => (await fetch("/api/playground")).json(),
    refetchInterval: (q) => (q.state.data?.running ? 1_500 : 10_000),
  });
  const s = status.data;

  async function start(beat: string) {
    setError(null);
    const r = await fetch("/api/playground", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ beat }) });
    if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${r.status}`);
    await qc.invalidateQueries({ queryKey: ["playground"] });
  }

  const coolingFor = s?.cooldownEndsAt ? Math.max(0, Math.ceil((s.cooldownEndsAt - Date.now()) / 1000)) : 0;
  const running = s?.job && s.job.finishedAt === undefined;

  return (
    <main className="shell">
      <PageHead
        n="K—04"
        rail="Playground · no wallet needed · Aevum testnet"
        eyebrow="Playground"
        title="Press a button. Watch the wallet *decide.*"
        lede={
          <>
            Each button runs a short demo on Aevum testnet with the demo agents. Watch it here and on the <Link href="/live">live desk</Link>. One
            run at a time, with a cooldown and a daily limit.
          </>
        }
        aside={
          s?.enabled && (
            <span className="pill">
              <span className={`pulse ${s.running ? "" : "live"}`} aria-hidden="true" />
              {s.running ? "Running" : coolingFor > 0 ? `Cooling down · ${coolingFor} s` : "Ready"} · {s.runsLeftToday} runs left today
            </span>
          )
        }
      />

      {!s ? (
        <p className="fine">{status.error ? "Couldn't reach the playground." : "Loading…"}</p>
      ) : !s.enabled ? (
        <Reveal className="card">
          <p className="card-label" style={{ marginBottom: 12 }}>
            Switched off on this server
          </p>
          <p style={{ marginBottom: 16, color: "var(--muted)" }}>The playground needs the demo keys on the server. Run the same demos yourself:</p>
          <pre>pnpm --filter @kibble/agents scenario hijack</pre>
        </Reveal>
      ) : (
        <section className="stack">
          <SecHead n="01" title="Pick a *story.*" note="Each one sends real transactions with the demo keys. The result stays on chain." />
          <div className="beats">
            {Object.entries(s.beats).map(([key, b], i) => (
              <Reveal key={key} className="card beat" delay={i * 0.1}>
                <span className="beat-n" aria-hidden="true">
                  0{i + 1}
                </span>
                <h2>{b.title}</h2>
                <p className="fine" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
                  {b.about}
                </p>
                <button className="btn" disabled={s.running || coolingFor > 0 || s.runsLeftToday === 0} onClick={() => start(key)}>
                  Run {b.title.toLowerCase()} <Arrow />
                </button>
              </Reveal>
            ))}
          </div>
        </section>
      )}
      {error && <p className="notice bad">{error}</p>}
      {s?.job && (
        <section className="stack">
          <SecHead n="02" title="The *run.*" note={`Run #${s.job.id}: ${s.beats[s.job.beat]?.title ?? s.job.beat}`} />
          <Reveal className="card terminal">
            <div className="terminal-top">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>kibble · {s.job.beat}</span>
              <span style={{ marginLeft: "auto" }} className={`st ${running ? "Watch" : s.job.ok ? "Healthy" : "Paused"}`}>
                <i aria-hidden="true" />
                {running ? "running" : s.job.ok ? "finished" : "stopped"}
              </span>
            </div>
            <pre aria-live="polite">
              <AnimatePresence initial={false}>
                {(s.job.lines.length ? s.job.lines : ["Starting…"]).map((line, i) => (
                  <motion.span
                    key={i}
                    style={{ display: "block" }}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    {line}
                  </motion.span>
                ))}
              </AnimatePresence>
              {running && <span className="caret" aria-hidden="true" />}
            </pre>
          </Reveal>
        </section>
      )}
    </main>
  );
}
