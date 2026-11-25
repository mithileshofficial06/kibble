"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { encodeAbiParameters, erc20Abi, isAddress, isHex, type Address, type Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { PARAMS, Param, decodeDrawerLogs, sendDrawer, signResume, units, type Wallet } from "@kibble/sdk";
import { explain } from "@/lib/errors";
import { AGENTS, amt, pct, short, useBuyers, useDeployment, useDrawer, useDrawerConfig, useDrawerHistory, usePub, useReceipts, type AgentName } from "@/lib/kibble";
import { useNetwork } from "@/lib/network";
import { whyState } from "@/lib/plain";
import { SimpleControls } from "@/components/SimpleControls";
import { Term } from "@/components/Term";
import { Num, PageHead, Reveal, SecHead, StatePill } from "@/components/ui";

/** One drawer: its numbers, receipts, track record and the owner/guardian controls. Also the "verify" page. */
export default function DrawerPage() {
  const params = useParams<{ address: string }>();
  const address = isAddress(params.address) ? (params.address as Address) : undefined;
  const dep = useDeployment();
  const v = useDrawer(address);
  const cfg = useDrawerConfig(address);
  const buyers = useBuyers(address);
  const receipts = useReceipts(address, v.data?.receiptCount);
  // Aevum makes ~1 block a second and serves logs 1,000 blocks at a time, so the range is a choice.
  const [range, setRange] = useState<bigint>(20_000n);
  const history = useDrawerHistory(address, dep.data ? BigInt(dep.data.deployBlock) : undefined, range);
  const name = dep.data && (Object.entries(dep.data.drawers).find(([, a]) => a?.toLowerCase() === address?.toLowerCase())?.[0] as AgentName | undefined);

  if (!address) return <main className="shell"><p>That isn&apos;t a drawer address.</p></main>;
  const d = v.data;
  const c = cfg.data;
  const paused = d?.state === "Paused" || d?.state === "Revoked";
  // the contract's own reason for the last change of state, if it's recent enough to have been read
  const lastChange = history.data?.feed.find((e) => /^\w+ → /.test(e.text))?.text.split(": ").slice(1).join(": ");

  return (
    <main className="shell">
      <PageHead
        n="K—03"
        rail={`Agent · ${short(address)}`}
        eyebrow={
          <>
            <Link href="/live">Live agents</Link> / {name ? "Demo agent" : "Agent"}
          </>
        }
        live
        title={name ? AGENTS[name].label : short(address)}
        lede={
          <>
            {name ? `${AGENTS[name].about} ` : "An agent on Kibble. "}Everything it earned, paid and was refused is public. Contract <Explorer address={address} />.
          </>
        }
        aside={d && <StatePill state={d.state} />}
      />

      {d && <p className={`why big-why ${d.state}`}>{whyState(d, lastChange)}</p>}

      <Reveal className="stats">
        <div className="stat">
          <span className="stat-label">
            <Term k="limit" />
          </span>
          <Num className={`big ${paused ? "coral" : ""}`} value={d ? amt(d.limitT) : undefined} />
          <span className="stat-sub">{d?.mode === "FIXED" ? "the same every round" : `can grow to ${amt(d?.tMax)}`}</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Term k="exposure" />
          </span>
          <Num className={`big mid ${d?.maxLossNow === 0n ? "mint" : ""}`} value={d ? amt(d.maxLossNow) : undefined} />
          <span className="stat-sub">right now, with the agent&apos;s key</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Term k="canSpend" />
          </span>
          <Num className="big mid" value={d ? amt(d.allowance) : undefined} />
          <span className="stat-sub">{d ? `${d.strikes} of 3 strikes` : "…"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">In the box</span>
          <Num className="big mid" value={d ? amt(d.balance) : undefined} />
          <span className="stat-sub">tUSD8, test money</span>
        </div>
      </Reveal>

      {c && d && (
        <section className="stack">
          <SecHead n="01" title="Take *control.*" note="Only the owner and guardian can. The contract checks, not this page." />
          <SimpleControls
            drawer={address}
            d={d}
            owner={c.owner}
            guardian={c.guardian}
            approvalThreshold={c.approvalThreshold}
            maxWeeklyLoss={c.maxWeeklyLoss}
            resumeNonce={c.resumeNonce}
          />
          <details className="advanced">
            <summary>Advanced controls</summary>
            <Controls drawer={address} owner={c.owner} guardian={c.guardian} resumeNonce={c.resumeNonce} />
          </details>
        </section>
      )}

      <section className="stack">
        <SecHead n="02" title="Who actually *paid?*" note="From its latest sales. Earnings alone don't prove customers." />
        <Reveal className="card">
          {!buyers.data ? (
            <p className="fine">{buyers.error ? explain(buyers.error) : "Reading…"}</p>
          ) : buyers.data.sales === 0 ? (
            <p className="fine">No sales yet.</p>
          ) : (
            <>
              <dl className="kv">
                <dt>Sales read</dt>
                <dd>
                  {buyers.data.sales} of {buyers.data.totalSales} (refunded {buyers.data.refunded})
                </dd>
                <dt>Different buyers</dt>
                <dd>{buyers.data.buyers}</dd>
                <dt>From the biggest buyer</dt>
                <dd>
                  {(buyers.data.topShare * 100).toFixed(1)}% {buyers.data.topBuyer && <Explorer address={buyers.data.topBuyer} />}
                </dd>
                <dt>From the owner, guardian or agent themselves</dt>
                <dd>{(buyers.data.insiderShare * 100).toFixed(1)}%</dd>
                <dt>From unknown senders (plain transfers)</dt>
                <dd>{(buyers.data.unknownShare * 100).toFixed(1)}%</dd>
              </dl>
              <p className="fine">
                {buyers.data.buyers <= 1 || buyers.data.topShare > 0.8 || buyers.data.insiderShare > 0.2
                  ? "Concentrated: treat this track record as activity, not as proof of customers."
                  : "Spread over several buyers. That's harder to fake, not impossible: one person can use many wallets."}
              </p>
            </>
          )}
        </Reveal>
      </section>

      <section className="stack">
        <SecHead n="03" title="What it *paid.*" note="The latest 25 payments." />
        <Reveal className="card flush">
        {receipts.data?.length ? (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Payments, scrolls sideways">
            <table className="docs-table mono-cells">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Time</th>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>State then</th>
                  <th>T then</th>
                  <th>Window value / spent</th>
                  <th>Approved by</th>
                </tr>
              </thead>
              <tbody>
                {receipts.data.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{new Date(Number(r.time) * 1000).toLocaleString()}</td>
                    <td>{short(r.payee)}</td>
                    <td>{amt(r.amount)}</td>
                    <td>
                      <StatePill state={r.state} />
                    </td>
                    <td>{amt(r.limitT)}</td>
                    <td>
                      {amt(r.windowValue)} / {amt(r.windowSpend)}
                    </td>
                    <td>{c && r.approvedBy.toLowerCase() === c.owner.toLowerCase() ? "owner" : "agent"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="fine">{receipts.isLoading ? "Reading…" : "No payments yet."}</p>
        )}
        </Reveal>
      </section>

      <section className="stack">
        <SecHead n="04" title="What the wallet *decided.*" note="Every refusal and change, with the contract's reason." />
        <div className="grid-2">
        <Reveal className="card flush">
          <h2>Track record</h2>
          <p className="fine">
            One row per closed window (TrackRecord events), blocks {history.data?.from.toString()}–{history.data?.head.toString()}.{" "}
            <label>
              Read the last{" "}
              <select value={range.toString()} onChange={(e) => setRange(BigInt(e.target.value))}>
                <option value="20000">~6 hours</option>
                <option value="90000">~1 day</option>
                <option value="300000">~3 days</option>
              </select>
            </label>
          </p>
          {history.data?.windows.length ? (
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Track record, scrolls sideways">
              <table className="docs-table mono-cells">
                <thead>
                  <tr>
                    <th>Window</th>
                    <th>Value</th>
                    <th>Spent</th>
                    <th>Profit</th>
                    <th>T</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.windows.map((w) => (
                    <tr key={w.index.toString()}>
                      <td>{w.index.toString()}</td>
                      <td>{amt(w.value)}</td>
                      <td>{amt(w.spend)}</td>
                      <td>{amt(w.profit)}</td>
                      <td>{amt(w.limitT)}</td>
                      <td>
                        <StatePill state={w.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="fine">{history.isLoading ? "Reading…" : "No closed windows in this range."}</p>
          )}
        </Reveal>
        <Reveal className="card" delay={0.1}>
          <h2>Decisions</h2>
          {history.data?.feed.length ? (
            <ul className="feed">
              {history.data.feed.slice(0, 40).map((e, i) => (
                <li key={i} className={/Paused|Braked|Alert|refus|over|ceiling/i.test(e.text) ? "bad" : ""}>
                  <Explorer tx={e.tx} label={`#${e.block}`} /> {e.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">{history.isLoading ? "Reading…" : "No refusals, state changes or alerts in this range."}</p>
          )}
        </Reveal>
        </div>
      </section>
      <section className="stack">
        <SecHead n="05" title="Every *number.*" note="For the curious. Read from the contract every few seconds." />
        <div className="grid-2">
        <Reveal className="card">
          <h2>Now</h2>
          {!d ? (
            <p className="fine">{v.error ? explain(v.error) : "Reading…"}</p>
          ) : (
            <dl className="kv">
              <dt>Mode</dt>
              <dd>{d.mode === "FIXED" ? "Fixed limit" : "Kibble (earned)"}</dd>
              <dt>State</dt>
              <dd>
                <StatePill state={d.state} /> strikes {d.strikes.toString()}
              </dd>
              <dt>Limit T</dt>
              <dd>
                {amt(d.limitT)} (max {amt(d.tMax)})
              </dd>
              <dt>Allowance</dt>
              <dd>{amt(d.allowance)}</dd>
              <dt>Hijack exposure (maxLossNow)</dt>
              <dd>
                <strong>{amt(d.maxLossNow)}</strong>
              </dd>
              <dt>Cost ceiling</dt>
              <dd>
                {pct(d.costBps)} (learned share {pct(d.learnedCostShareBps)})
              </dd>
              <dt>Window #{d.windowIndex.toString()}</dt>
              <dd>
                value {amt(d.windowValue)}, spent {amt(d.windowSpend)}, ends {new Date(Number(d.windowEndsAt) * 1000).toLocaleTimeString()}
              </dd>
              <dt>Lifetime</dt>
              <dd>
                value {amt(d.lifetimeValue)}, spent {amt(d.lifetimeSpend)}
              </dd>
              <dt>Weekly drawdown</dt>
              <dd>{amt(d.drawdown)}</dd>
              <dt>Pending income / work budget / runway / reserve</dt>
              <dd>
                {amt(d.pendingTotal)} / {amt(d.workBudget)} / {amt(d.runway)} / {amt(d.reserve)}
              </dd>
              <dt>Stranger budget left</dt>
              <dd>{amt(d.unknownRemaining)}</dd>
              <dt>Balance</dt>
              <dd>{amt(d.balance)} tUSD8</dd>
            </dl>
          )}
        </Reveal>
        <Reveal className="card" delay={0.1}>
          <h2>Settings</h2>
          {!c ? (
            <p className="fine">Reading…</p>
          ) : (
            <dl className="kv">
              <dt>Max weekly loss (the one owner setting)</dt>
              <dd>{amt(c.maxWeeklyLoss)}</dd>
              <dt>Approval threshold</dt>
              <dd>{amt(c.approvalThreshold)}</dd>
              <dt>Window / income hold / loosening delay</dt>
              <dd>
                {c.windowLength.toString()} s / {c.incomeHold.toString()} s / {c.delay.toString()} s
              </dd>
              <dt>Owner</dt>
              <dd>
                <Explorer address={c.owner} />
              </dd>
              <dt>Guardian</dt>
              <dd>
                <Explorer address={c.guardian} />
              </dd>
              <dt>Agent key</dt>
              <dd>
                <Explorer address={c.agent} />
              </dd>
              <dt>Vault</dt>
              <dd>
                <Explorer address={c.vault} />
              </dd>
            </dl>
          )}
        </Reveal>
        </div>
      </section>

    </main>
  );
}

function Explorer({ address, tx, label }: { address?: Address; tx?: Hex; label?: string }) {
  const { net } = useNetwork();
  const text = label ?? (address ? short(address) : short(tx));
  if (!net.hasExplorer) return <code>{label ?? address ?? tx}</code>;
  const base = net.chain.blockExplorers?.default.url;
  return (
    <a href={`${base}/${address ? "address" : "tx"}/${address ?? tx}`} target="_blank" rel="noreferrer">
      {text}
    </a>
  );
}

// ------------------------------------------------------------------------------- controls

/** Owner and guardian buttons. The contract decides who may do what; the page just sends. */
function Controls({ drawer, owner, guardian, resumeNonce }: { drawer: Address; owner: Address; guardian: Address; resumeNonce: bigint }) {
  const { address, isConnected, chainId } = useAccount();
  const { net } = useNetwork();
  const { data: wallet } = useWalletClient({ chainId: net.chain.id });
  const pub = usePub();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [param, setParam] = useState<(typeof PARAMS)[number]>("ApprovalThreshold");
  const [paramValue, setParamValue] = useState("");
  const [fund, setFund] = useState("");
  const [runway, setRunway] = useState("");
  const [runwayHours, setRunwayHours] = useState("24");
  const [queueId, setQueueId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [ownerSig, setOwnerSig] = useState("");
  const [guardianSig, setGuardianSig] = useState("");

  const me = address?.toLowerCase();
  const role = me === owner.toLowerCase() ? "owner" : me === guardian.toLowerCase() ? "guardian" : null;
  const ready = isConnected && chainId === net.chain.id && wallet && pub;

  /** Runs one action; `fn` may return a sentence to show instead of "done". */
  async function run(label: string, fn: (w: Wallet) => Promise<unknown>) {
    if (!wallet || !pub) return;
    setBusy(label);
    setMsg(null);
    try {
      const note = await fn(wallet as Wallet);
      setMsg(`${label}: ${typeof note === "string" ? note : "done."}`);
    } catch (e) {
      setMsg(`${label}: ${explain(e)}`);
    } finally {
      setBusy(null);
    }
  }
  /** Arguments are built inside the guarded call, so bad input shows a message instead of throwing. */
  const send = (label: string, fn: string, args: () => readonly unknown[] = () => []) =>
    run(label, (w) => sendDrawer(pub!, w, drawer, fn, args()));

  async function signForResume() {
    if (!wallet) return;
    await run("Sign resume", async (w) => {
      const dl = deadline ? BigInt(deadline) : BigInt(Math.floor(Date.now() / 1000) + 3600);
      setDeadline(dl.toString());
      const sig = await signResume(w, drawer, { nonce: resumeNonce, deadline: dl });
      if (role === "owner") setOwnerSig(sig);
      else if (role === "guardian") setGuardianSig(sig);
      else setOwnerSig(sig);
    });
  }

  return (
    <Reveal className="card">
      <p className="fine">
        {!isConnected
          ? "Connect the owner's or guardian's wallet to use these. Anyone can see them; only the contract decides who may act."
          : role
            ? `Connected as the ${role}.`
            : "The connected wallet is neither the owner nor the guardian: the contract will refuse owner actions."}
      </p>
      <div className="stack" style={{ gap: 0, marginTop: 8 }}>
        <div className="controls-group">
        <span className="controls-title">Keep it current · stop it</span>
        <div className="row">
          <button className="btn small" disabled={!ready || !!busy} onClick={() => send("Sync", "sync")}>
            Sync (close finished windows)
          </button>
          <button className="btn small warn" disabled={!ready || !!busy} onClick={() => send("Freeze", "freeze")}>
            Freeze (owner or guardian)
          </button>
          <button
            className="btn small warn"
            disabled={!ready || !!busy}
            onClick={() => confirm("Revoke sweeps everything to the vault and can't be undone. Continue?") && send("Revoke", "revoke")}
          >
            Revoke (owner)
          </button>
        </div>
        </div>

        <div className="controls-group">
        <span className="controls-title">Tighten now · raise slowly</span>
        <div className="row">
          <label>
            Tighten{" "}
            <select value={param} onChange={(e) => setParam(e.target.value as (typeof PARAMS)[number])}>
              {PARAMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <input placeholder="new value (tUSD8 or bps)" value={paramValue} onChange={(e) => setParamValue(e.target.value)} />
          <button
            className="btn small"
            disabled={!ready || !!busy || !paramValue}
            onClick={() => send("Tighten", "tighten", () => [Param[param], /Bps$/.test(param) ? BigInt(paramValue) : units(paramValue)])}
          >
            Tighten now
          </button>
          <button
            className="btn small secondary"
            disabled={!ready || !!busy || !paramValue}
            onClick={() =>
              run("Queue raise", async (w) => {
                const value = /Bps$/.test(param) ? BigInt(paramValue) : units(paramValue);
                const data = encodeAbiParameters([{ type: "uint8" }, { type: "uint256" }], [Param[param], value]);
                const receipt = await sendDrawer(pub!, w, drawer, "queue", [2 /* Action.RaiseParam */, data]);
                const queued = decodeDrawerLogs(receipt, drawer).find((l) => l.eventName === "ActionQueued");
                if (!queued || queued.eventName !== "ActionQueued") return "queued.";
                setQueueId(queued.args.id);
                const readyAt = new Date(Number(queued.args.readyAt) * 1000).toLocaleTimeString();
                return `queued as ${queued.args.id}. Execute it after ${readyAt}; the guardian can cancel it before then.`;
              })
            }
          >
            Queue a raise (owner, waits the delay)
          </button>
        </div>
        <div className="row">
          <input placeholder="queued action id (0x…)" value={queueId} onChange={(e) => setQueueId(e.target.value)} />
          <button className="btn small" disabled={!ready || !!busy || !isHex(queueId)} onClick={() => send("Execute", "execute", () => [queueId])}>
            Execute (owner)
          </button>
          <button className="btn small secondary" disabled={!ready || !!busy || !isHex(queueId)} onClick={() => send("Cancel", "cancel", () => [queueId])}>
            Cancel (owner or guardian)
          </button>
        </div>
        </div>

        <div className="controls-group">
        <span className="controls-title">Money in</span>
        <div className="row">
          <input placeholder="tUSD8" value={fund} onChange={(e) => setFund(e.target.value)} />
          <button
            className="btn small"
            disabled={!ready || !!busy || !fund}
            onClick={() =>
              run("Fund allowance", async (w) => {
                const token = await pub!.readContract({ address: drawer, abi: [{ type: "function", name: "token", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }], functionName: "token" });
                const have = await pub!.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [w.account.address, drawer] });
                if (have < units(fund)) {
                  const h = await w.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [drawer, units(fund)], type: "legacy" } as never);
                  await pub!.waitForTransactionReceipt({ hash: h });
                }
                await sendDrawer(pub!, w, drawer, "fundAllowance", [units(fund)]);
              })
            }
          >
            Fund allowance (owner)
          </button>
        </div>
        <div className="row">
          <input placeholder="runway tUSD8" value={runway} onChange={(e) => setRunway(e.target.value)} />
          <input placeholder="hours" value={runwayHours} onChange={(e) => setRunwayHours(e.target.value)} />
          <button
            className="btn small"
            disabled={!ready || !!busy || !runway}
            onClick={() =>
              send("Grant runway", "grantRunway", () => [units(runway), BigInt(Math.floor(Date.now() / 1000) + Math.round(Number(runwayHours) * 3600))])
            }
          >
            Grant runway (owner; the drawer pulls it from your wallet)
          </button>
        </div>
        </div>

        <div className="controls-group">
        <span className="controls-title">Two-key resume</span>
          <p className="fine">
            Instant resume needs both keys: the owner and the guardian each sign (nonce {resumeNonce.toString()}), then anyone submits.
          </p>
          <div className="row">
            <button className="btn small" disabled={!ready || !!busy} onClick={signForResume}>
              Sign resume with this wallet
            </button>
            <input placeholder="deadline (unix seconds)" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <input placeholder="owner signature (0x…)" value={ownerSig} onChange={(e) => setOwnerSig(e.target.value)} />
          <input placeholder="guardian signature (0x…)" value={guardianSig} onChange={(e) => setGuardianSig(e.target.value)} />
          <button
            className="btn small"
            disabled={!ready || !!busy || !isHex(ownerSig) || !isHex(guardianSig) || !deadline}
            onClick={() => send("Resume now", "resumeNow", () => [BigInt(deadline), ownerSig, guardianSig])}
          >
            Submit resumeNow
          </button>
        </div>
        {busy && <p className="fine">{busy}: confirm in your wallet…</p>}
        {msg && <p className="notice">{msg}</p>}
      </div>
    </Reveal>
  );
}
