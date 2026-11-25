"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { erc20Abi, parseAbi, type Address, type Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { Param, sendDrawer, signResume, units, type DrawerView, type Wallet } from "@kibble/sdk";
import { explain } from "@/lib/errors";
import { amt, short, usePub } from "@/lib/kibble";
import { useNetwork } from "@/lib/network";
import { Term } from "./Term";

const MONEY = /^\d{1,6}(\.\d{1,6})?$/;
type Sigs = { deadline: string; owner?: Hex; guardian?: Hex };

/** Signatures survive switching accounts and reloading: they're useless for anything but this one restart. */
function useSigs(drawer: Address, nonce: bigint) {
  const key = `kibble-resume:${drawer.toLowerCase()}:${nonce}`;
  const [sigs, setSigs] = useState<Sigs | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const s = raw ? (JSON.parse(raw) as Sigs) : null;
      setSigs(s && Number(s.deadline) * 1000 > Date.now() + 30_000 ? s : null);
    } catch {
      setSigs(null);
    }
  }, [key]);
  const save = (s: Sigs | null) => {
    setSigs(s);
    try {
      if (s) sessionStorage.setItem(key, JSON.stringify(s));
      else sessionStorage.removeItem(key);
    } catch {
      // not kept across a reload, that's all
    }
  };
  return [sigs, save] as const;
}

/** The three things an owner does: stop it, lower something, add money. And a guided restart. */
export function SimpleControls({
  drawer,
  d,
  owner,
  guardian,
  approvalThreshold,
  maxWeeklyLoss,
  resumeNonce,
}: {
  drawer: Address;
  d: DrawerView;
  owner: Address;
  guardian: Address;
  approvalThreshold: bigint;
  maxWeeklyLoss: bigint;
  resumeNonce: bigint;
}) {
  const { address, isConnected, chainId } = useAccount();
  const { net } = useNetwork();
  const { data: wallet } = useWalletClient({ chainId: net.chain.id });
  const pub = usePub();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [what, setWhat] = useState<keyof typeof CURRENT>("ApprovalThreshold");
  const [value, setValue] = useState("");
  const [add, setAdd] = useState("");
  const [sigs, setSigs] = useSigs(drawer, resumeNonce);

  const CURRENT = {
    ApprovalThreshold: { label: "Payments above this need my signature", now: approvalThreshold },
    T: { label: "The spending limit", now: d.limitT },
    UnknownBudget: { label: "What it may ever pay to strangers", now: d.unknownRemaining },
    MaxWeeklyLoss: { label: "The most I'd lose in a week", now: maxWeeklyLoss },
  } as const;

  const me = address?.toLowerCase();
  const isOwner = me === owner.toLowerCase();
  const isGuardian = me === guardian.toLowerCase();
  const ready = isConnected && chainId === net.chain.id && Boolean(wallet && pub);
  const stopped = d.state === "Paused" || d.state === "Braked";
  const over = d.state === "Revoked";

  async function run(label: string, fn: (w: Wallet) => Promise<string | void>) {
    if (!wallet || !pub) return;
    setBusy(label);
    setMsg(null);
    try {
      const text = await fn(wallet as Wallet);
      setMsg({ text: text ?? "Done." });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["kibble-drawer", drawer] }),
        qc.invalidateQueries({ queryKey: ["kibble-drawer-config", drawer] }),
      ]);
    } catch (e) {
      setMsg({ text: explain(e), bad: true });
    } finally {
      setBusy(null);
    }
  }

  const switchAccount = () =>
    run("switch", async (w) => {
      await w.requestPermissions({ eth_accounts: {} });
      return "Account changed. Carry on below.";
    });

  const sign = (role: "owner" | "guardian") =>
    run("sign", async (w) => {
      const block = (await pub!.getBlock()).timestamp;
      const wall = BigInt(Math.floor(Date.now() / 1000));
      const deadline = sigs ? BigInt(sigs.deadline) : (block > wall ? block : wall) + 3_600n;
      const sig = await signResume(w, drawer, { nonce: resumeNonce, deadline });
      setSigs({ ...(sigs ?? {}), deadline: deadline.toString(), [role]: sig });
      return role === "owner" ? "Signed as the owner." : "Signed as the guardian.";
    });

  const cur = CURRENT[what];
  const lowerProblem = !MONEY.test(value) ? "Enter an amount, like 0.1" : units(value) >= cur.now ? `It's ${amt(cur.now)} now. Enter something lower.` : null;
  const room = d.limitT > d.allowance ? d.limitT - d.allowance : 0n;
  const addProblem = !MONEY.test(add) || Number(add) <= 0 ? "Enter an amount, like 0.1" : d.mode === "EARNED" && units(add) > room ? `There's room for ${amt(room)} under its limit.` : null;

  const step = !sigs?.owner ? 1 : !sigs.guardian ? 2 : 3;

  return (
    <div className="stack">
      <div className={`who ${isOwner || isGuardian ? "ok" : ""}`} role="status">
        {!isConnected ? (
          <span>Connect your wallet (top right) to control this agent.</span>
        ) : chainId !== net.chain.id ? (
          <span>Switch your wallet to {net.chain.name}.</span>
        ) : isOwner ? (
          <span>You&apos;re connected as this agent&apos;s owner.</span>
        ) : isGuardian ? (
          <span>You&apos;re connected as this agent&apos;s guardian. You can stop it and help restart it.</span>
        ) : (
          <span>This agent belongs to {short(owner)}. You&apos;re connected as {short(address)}, so you can look but not change anything.</span>
        )}
      </div>

      {msg && (
        <p className={`notice ${msg.bad ? "bad" : ""}`} role={msg.bad ? "alert" : "status"}>
          {msg.text}
        </p>
      )}

      {over ? (
        <div className="ctl-card">
          <h3>Shut down for good</h3>
          <p>This agent can&apos;t be used again. Its money went back to the owner&apos;s vault.</p>
        </div>
      ) : (
        <div className="ctl">
          {stopped ? (
            <div className="ctl-card" style={{ gridColumn: "1 / -1" }}>
              <h3>Restart it</h3>
              <p>
                Restarting takes two signatures, the owner&apos;s and the <Term k="guardian">guardian&apos;s</Term>. Signing is free, and your progress is kept when
                you switch accounts.
              </p>
              <ol className="steps3">
                {(["owner", "guardian"] as const).map((role, i) => {
                  const who = role === "owner" ? owner : guardian;
                  const done = Boolean(sigs?.[role]);
                  const mine = role === "owner" ? isOwner : isGuardian;
                  const now = !done && (mine || step === i + 1);
                  return (
                    <li key={role} className={done ? "ok" : now ? "now" : ""}>
                      <i aria-hidden="true">{done ? "✓" : i + 1}</i>
                      <span>
                        {role === "owner" ? "The owner" : "The guardian"} signs ({short(who)}){done && ": done"}
                      </span>
                      {!done &&
                        (mine ? (
                          <button type="button" className="btn small" disabled={!ready || Boolean(busy)} onClick={() => void sign(role)}>
                            {busy === "sign" ? "Check your wallet…" : "Sign"}
                          </button>
                        ) : (
                          now && (
                            <button type="button" className="btn small ghost" disabled={!ready || Boolean(busy)} onClick={() => void switchAccount()}>
                              Switch to {short(who)}
                            </button>
                          )
                        ))}
                    </li>
                  );
                })}
                <li className={step === 3 ? "now" : ""}>
                  <i aria-hidden="true">3</i>
                  <span>Restart the agent (any account with a little tQDAY)</span>
                  {step === 3 && (
                    <button
                      type="button"
                      className="btn small"
                      disabled={!ready || Boolean(busy)}
                      onClick={() =>
                        void run("resume", async (w) => {
                          await sendDrawer(pub!, w, drawer, "resumeNow", [BigInt(sigs!.deadline), sigs!.owner!, sigs!.guardian!]);
                          setSigs(null);
                          return "Restarted. It gets less spending money until it has shown two clean rounds.";
                        })
                      }
                    >
                      {busy === "resume" ? "Restarting…" : "Restart"}
                    </button>
                  )}
                </li>
              </ol>
              {sigs && (
                <p className="fine">
                  Signatures are valid until {new Date(Number(sigs.deadline) * 1000).toLocaleTimeString()}.{" "}
                  <button type="button" className="linklike" onClick={() => setSigs(null)}>
                    Start over
                  </button>
                </p>
              )}
            </div>
          ) : (
            <div className="ctl-card">
              <h3>Stop it</h3>
              <p>The agent can&apos;t spend anything until you and the guardian restart it. A thief with its key gets nothing.</p>
              <button
                type="button"
                className="btn warn"
                disabled={!ready || Boolean(busy) || !(isOwner || isGuardian)}
                onClick={() => void run("stop", async (w) => (await sendDrawer(pub!, w, drawer, "freeze"), "Stopped. Nobody can spend from it now."))}
              >
                {busy === "stop" ? "Stopping…" : "Stop this agent"}
              </button>
            </div>
          )}

          {d.state !== "Paused" && (
            <>
              <form
                className="ctl-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (lowerProblem) return setMsg({ text: lowerProblem, bad: true });
                  void run("lower", async (w) => {
                    await sendDrawer(pub!, w, drawer, "tighten", [Param[what], units(value)]);
                    setValue("");
                    return `Lowered to ${value}.`;
                  });
                }}
              >
                <h3>Lower something</h3>
                <p>Takes effect at once. Raising it later has to wait, and the guardian can cancel it.</p>
                <label>
                  <span>What</span>
                  <select value={what} onChange={(e) => setWhat(e.target.value as keyof typeof CURRENT)}>
                    {(Object.keys(CURRENT) as (keyof typeof CURRENT)[]).map((k) => (
                      <option key={k} value={k}>
                        {CURRENT[k].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>New amount (now {amt(cur.now)})</span>
                  <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.trim())} placeholder="0.1" />
                </label>
                <button type="submit" className="btn" disabled={!ready || Boolean(busy) || !(isOwner || isGuardian) || !value}>
                  {busy === "lower" ? "Lowering…" : "Lower it"}
                </button>
              </form>

              <form
                className="ctl-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (addProblem) return setMsg({ text: addProblem, bad: true });
                  void run("add", async (w) => {
                    const amount = units(add);
                    const token = await pub!.readContract({ address: drawer, abi: parseAbi(["function token() view returns (address)"]), functionName: "token" });
                    // approve exactly this amount, never more
                    const hash = await w.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [drawer, amount], type: "legacy" } as never);
                    await pub!.waitForTransactionReceipt({ hash });
                    await sendDrawer(pub!, w, drawer, "fundAllowance", [amount]);
                    setAdd("");
                    return `Added ${add} tUSD8.`;
                  });
                }}
              >
                <h3>Add money</h3>
                <p>{d.mode === "EARNED" ? `Tops up its spending money, up to its limit. There's room for ${amt(room)}.` : "Adds to what it can spend, round after round."}</p>
                <label>
                  <span>Amount (tUSD8)</span>
                  <input inputMode="decimal" value={add} onChange={(e) => setAdd(e.target.value.trim())} placeholder="0.1" />
                </label>
                <button type="submit" className="btn" disabled={!ready || Boolean(busy) || !isOwner || !add}>
                  {busy === "add" ? "Adding…" : "Add it"}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
