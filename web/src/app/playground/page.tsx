"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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

  return (
    <main className="shell stack">
      <div className="page-head">
        <p className="eyebrow">Playground</p>
        <h1>Try it without a wallet</h1>
        <p className="lede">
          Each button runs a short demo on Aevum testnet with the demo agents. Watch the result here and on the <Link href="/live">live desk</Link>
          . One run at a time, with a cooldown and a daily limit.
        </p>
      </div>
      {!s ? (
        <p className="fine">{status.error ? "Couldn't reach the playground." : "Loading…"}</p>
      ) : !s.enabled ? (
        <div className="card">
          <p>The playground is switched off on this server. Run the same demos yourself:</p>
          <pre>pnpm --filter @kibble/agents scenario hijack</pre>
        </div>
      ) : (
        <>
          <div className="grid-2">
            {Object.entries(s.beats).map(([key, b]) => (
              <div key={key} className="card">
                <h2>{b.title}</h2>
                <p className="fine">{b.about}</p>
                <button className="btn" disabled={s.running || coolingFor > 0 || s.runsLeftToday === 0} onClick={() => start(key)}>
                  Run {b.title.toLowerCase()}
                </button>
              </div>
            ))}
          </div>
          <p className="fine">
            {s.running ? "A run is in progress." : coolingFor > 0 ? `Next run possible in ${coolingFor} s.` : "Ready."} Runs left today:{" "}
            {s.runsLeftToday}.
          </p>
        </>
      )}
      {error && <p className="notice">{error}</p>}
      {s?.job && (
        <div className="card">
          <h2>
            Run #{s.job.id}: {s.beats[s.job.beat]?.title ?? s.job.beat}{" "}
            <span className="pill">{s.job.finishedAt === undefined ? "running" : s.job.ok ? "finished" : "stopped"}</span>
          </h2>
          <pre>{s.job.lines.join("\n") || "Starting…"}</pre>
        </div>
      )}
    </main>
  );
}
