"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Arrow, PageHead, Reveal, SecHead } from "@/components/ui";

type Beat = { title: string; about: string; drawers: string[]; estSeconds: number };
type Status = {
  enabled: boolean;
  running: boolean;
  job?: { id: number; beat: string; startedAt: number; expectedSeconds?: number; finishedAt?: number; ok?: boolean; lines: string[] };
  cooldownEndsAt: number | null;
  runsLeftToday: number;
  fuelRuns?: number | null;
  fuelLow?: boolean;
  beats: Record<string, Beat>;
};

/** "about 5 min" / "about 40 s" */
function about(seconds: number) {
  return seconds >= 90 ? `about ${Math.round(seconds / 60)} min` : `about ${Math.max(5, Math.round(seconds / 5) * 5)} s`;
}

/** 1:05 */
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Time-based progress for a run: elapsed against the expected length (the last real run of that beat). */
function RunProgress({ job }: { job: NonNullable<Status["job"]> }) {
  const done = job.finishedAt !== undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);
  const elapsed = ((done ? job.finishedAt! : now) - job.startedAt) / 1000;
  const expected = job.expectedSeconds ?? 0;
  const over = !done && expected > 0 && elapsed > expected;
  // Never shows full until it is: a run that takes longer than usual parks at 95%.
  const frac = done ? 1 : expected > 0 ? Math.min(0.95, elapsed / expected) : 0.05;
  const label = done
    ? `${job.ok ? "Finished" : "Stopped"} in ${clock(elapsed)}`
    : over
      ? `${clock(elapsed)} elapsed · taking a little longer than last time`
      : `${clock(elapsed)} elapsed · ${expected > 0 ? `${about(expected - elapsed)} left` : "running"}`;
  return (
    <div className={`run-progress ${done ? (job.ok ? "done" : "bad") : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)} aria-valuetext={label}>
      <div className="run-progress-bar">
        <span style={{ transform: `scaleX(${frac})` }} />
      </div>
      <span className="run-progress-label">{label}</span>
    </div>
  );
}

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
            Each button runs a real demo on Aevum testnet with the demo agents, so it takes a few minutes: the wallet judges an agent once per
            window, and a window here is 2 real minutes. Watch it here and on the <Link href="/live">live desk</Link>. One run at a time, with a
            cooldown and a daily limit.
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
          <pre tabIndex={0}>pnpm --filter @kibble/agents scenario hijack</pre>
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
                <span className="beat-time">{about(b.estSeconds)} on chain</span>
                <button className="btn" disabled={s.running || coolingFor > 0 || s.runsLeftToday === 0 || s.fuelRuns === 0} onClick={() => start(key)}>
                  Run {b.title.toLowerCase()} <Arrow />
                </button>
              </Reveal>
            ))}
          </div>
        </section>
      )}
      {s?.enabled && s.fuelLow && (
        <p className="notice bad">
          The demo wallets are low on testnet gas: about {s.fuelRuns} {s.fuelRuns === 1 ? "run" : "runs"} left. The <Link href="/live">live desk</Link>{" "}
          still shows every earlier run.
        </p>
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
            <RunProgress job={s.job} />
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
