"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { Param, sendDrawer, type Wallet } from "@kibble/sdk";
import { EASE, PageHead, Reveal, SecHead, StatePill } from "@/components/ui";
import { explain } from "@/lib/errors";
import { AGENTS, amt, short, useDeployment, useDrawer, useDrawerConfig, usePub, type AgentName } from "@/lib/kibble";
import { useNetwork } from "@/lib/network";

type Action =
  | { kind: "freeze" | "sync" | "resume"; why: string }
  | { kind: "tighten"; param: keyof typeof Param; label: string; value: string; raw: string; from: string; why: string };
type Answer = { text: string; model: string | null; note?: string; actions: Action[]; rejected: string[]; state: string; block: number };
type Item = { role: "user"; text: string } | { role: "assistant"; text: string; answer: Answer };

const ASK = ["What state is it in, and why?", "How much could a thief take right now?", "Is it making money?", "Lower the approval threshold by half", "Stop this agent"];

/** Chat with an assistant that reads the chain. It prepares actions; only the owner's wallet can sign them. */
export default function AssistantPage() {
  const dep = useDeployment();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const mode = useQuery({ queryKey: ["assistant"], queryFn: async (): Promise<{ model: boolean }> => (await fetch("/api/assistant")).json() });

  const chosen = picked || dep.data?.drawers.A || "";
  const drawer = isAddress(chosen) ? (chosen as Address) : undefined;
  const v = useDrawer(drawer);

  useEffect(() => {
    if (items.length) end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [items, busy]);

  function choose(addr: string) {
    setPicked(addr.trim());
    setItems([]);
    setError(null);
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy || !drawer) return;
    setText("");
    setError(null);
    setBusy(true);
    const next: Item[] = [...items, { role: "user", text: q }];
    setItems(next);
    try {
      // the latest turns, always starting with a question
      const turns = next.slice(-5).map((i) => ({ role: i.role, text: i.text }));
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ drawer, turns }) });
      const body = (await r.json()) as Answer & { error?: string };
      if (!r.ok) throw new Error(body.error ?? "Something went wrong. Try again.");
      setItems([...next, { role: "assistant", text: body.text, answer: body }]);
      void qc.invalidateQueries({ queryKey: ["kibble-drawer", drawer] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <PageHead
        n="K—07"
        rail="Assistant"
        eyebrow={mode.data?.model ? "A real model, reading the chain" : "Reading the chain"}
        live
        title="Ask your agent's *wallet.*"
        lede="Why was it paused? What could a thief take? The assistant reads the agent's record and answers. It can prepare a change, but it holds no key: you sign, and the contract decides."
      />

      <section className="stack">
        <SecHead n="01" title="Pick an *agent,* then ask" note="Any agent on Kibble works, including yours." />
        <div className="chat-grid">
          <Reveal className="card chat-side">
            <div className="form">
              <label>
                <span>Agent</span>
                <select value={Object.values(dep.data?.drawers ?? {}).includes(chosen as Address) ? chosen : ""} onChange={(e) => choose(e.target.value)}>
                  <option value="" disabled>
                    Your own agent
                  </option>
                  {(Object.entries(dep.data?.drawers ?? {}) as [AgentName, Address][]).map(([name, a]) => (
                    <option key={name} value={a}>
                      {AGENTS[name].label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Or paste an agent&apos;s address</span>
                <input className="mono" placeholder="0x…" value={picked} onChange={(e) => choose(e.target.value)} />
              </label>
            </div>
            <dl className="kv chat-kv">
              <dt>State</dt>
              <dd>{v.data ? <StatePill state={v.data.state} /> : v.error ? "not a Kibble agent" : "…"}</dd>
              <dt>Limit</dt>
              <dd>{amt(v.data?.limitT)}</dd>
              <dt>A thief could take</dt>
              <dd>{amt(v.data?.maxLossNow)}</dd>
            </dl>
            {drawer && (
              <p className="fine">
                <Link href={`/drawer/${drawer}`}>Receipts and controls</Link>
              </p>
            )}
          </Reveal>

          <Reveal className="card chat" delay={0.1}>
            <div className="chat-log" role="log" aria-live="polite">
              {!items.length && (
                <div className="chat-empty">
                  <p className="fine">Try one:</p>
                  <div className="row">
                    {ASK.map((q) => (
                      <button key={q} type="button" className="btn small ghost" disabled={busy || !drawer} onClick={() => void ask(q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {items.map((i, k) =>
                i.role === "user" ? (
                  <p key={k} className="msg me">
                    {i.text}
                  </p>
                ) : (
                  <Reply key={k} answer={i.answer} drawer={drawer!} />
                ),
              )}
              {busy && <p className="msg wait" aria-label="Reading the chain">Reading the chain…</p>}
              <div ref={end} />
            </div>
            {error && (
              <p className="fine bad-text" role="alert">
                {error}
              </p>
            )}
            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(text);
              }}
            >
              <input aria-label="Your question" placeholder="Ask about this agent" maxLength={600} value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn" type="submit" disabled={busy || !text.trim() || !drawer}>
                Ask
              </button>
            </form>
            <p className="fine">
              {mode.data?.model
                ? "Answers come from an AI model reading this agent's public record. It can be wrong: check the numbers on the agent's page."
                : "No model is switched on for this server, so these are built-in answers from chain data."}
            </p>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

function Reply({ answer, drawer }: { answer: Answer; drawer: Address }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className="msg bot" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
      {answer.text
        .split(/\n+/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p.replace(/\*\*/g, "")}</p>
        ))}
      {answer.actions.map((a, i) => (
        <ActionCard key={i} action={a} drawer={drawer} />
      ))}
      <span className="msg-src">
        {answer.model ? answer.model.split("/").at(-1) : "built-in answer"} · block {answer.block.toLocaleString("en-US")}
        {answer.note ? ` · ${answer.note}` : ""}
      </span>
    </motion.div>
  );
}

/** A prepared action. Nothing is sent until the owner (or guardian) signs it in their own wallet. */
function ActionCard({ action, drawer }: { action: Action; drawer: Address }) {
  const { address, chainId } = useAccount();
  const { net } = useNetwork();
  const { data: wallet } = useWalletClient({ chainId: net.chain.id });
  const pub = usePub();
  const cfg = useDrawerConfig(drawer);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const me = address?.toLowerCase();
  const isOwner = Boolean(me && me === cfg.data?.owner.toLowerCase());
  const isGuardian = Boolean(me && me === cfg.data?.guardian.toLowerCase());
  const may = action.kind === "sync" ? Boolean(me) : isOwner || isGuardian;
  const title =
    action.kind === "tighten"
      ? `Lower the ${action.label}: ${action.from} → ${action.value}`
      : { freeze: "Freeze the agent now", sync: "Close finished windows", resume: "Resume the agent" }[action.kind];

  async function sign() {
    if (!wallet || !pub) return;
    setBusy(true);
    setMsg(null);
    try {
      const w = wallet as Wallet;
      if (action.kind === "freeze") await sendDrawer(pub, w, drawer, "freeze");
      else if (action.kind === "sync") await sendDrawer(pub, w, drawer, "sync");
      else if (action.kind === "tighten") await sendDrawer(pub, w, drawer, "tighten", [Param[action.param], BigInt(action.raw)]);
      setMsg("Done: confirmed on chain.");
      void qc.invalidateQueries({ queryKey: ["kibble-drawer", drawer] });
    } catch (e) {
      setMsg(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="act">
      <span className="card-label">Prepared, not sent</span>
      <strong>{title}</strong>
      {action.why && <p className="fine">{action.why}</p>}
      {action.kind === "resume" ? (
        <p className="fine">
          Needs two signatures. <Link href={`/drawer/${drawer}`}>Open the controls</Link> to sign as owner and guardian.
        </p>
      ) : (
        <div className="row">
          <button className={`btn small ${action.kind === "freeze" ? "warn" : ""}`} type="button" disabled={!may || busy || !wallet || chainId !== net.chain.id} onClick={() => void sign()}>
            {busy ? "Waiting…" : "Review and sign"}
          </button>
          {!may && <span className="fine">{action.kind === "sync" ? "Connect a wallet." : `Only the owner or guardian (${short(cfg.data?.owner)}) can sign this.`}</span>}
        </div>
      )}
      {msg && (
        <p className="fine" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
