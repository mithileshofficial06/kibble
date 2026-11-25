import { erc20Abi, keccak256, toHex, type Address } from "viem";
import {
  Param,
  kibbleDrawerAbi,
  newBillRef,
  payOnce,
  readDrawer,
  sendDrawer,
  signPayApproval,
  signResume,
  signWorkAccepted,
  type DrawerView,
} from "@kibble/sdk";
import { advance, deadlineIn, now, type Ctx, type Role } from "./chain";
import { AGENTS, type AgentName, type Deployment } from "./deployments";
import { units } from "@kibble/sdk";

/** A demo amount as text, at the current scale: amt(ctx, 0.5) is "0.50" locally, "0.050" on testnet. */
const amt = (ctx: Ctx, x: number) => ctx.f(ctx.u(x));
import { injectionPage, runSummarizer } from "./injection";
import type { Llm } from "./llm";
import { agentPay, handleSale, sync, windowEndsAt } from "./shop";

type Side = { name: AgentName; drawer: Address; role: Role };

function side(dep: Deployment, name: AgentName): Side {
  const drawer = dep.drawers[name];
  if (!drawer) throw new Error(`drawer ${name} missing from the deployment`);
  return { name, drawer, role: AGENTS[name].agentRole };
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

function brief(ctx: Ctx, v: DrawerView) {
  return `${pad(v.state, 8)} T=${lpad(ctx.f(v.limitT), 5)} allow=${lpad(ctx.f(v.allowance), 5)} maxLossNow=${lpad(ctx.f(v.maxLossNow), 6)}`;
}

async function vaultBalance(ctx: Ctx, dep: Deployment) {
  return ctx.pub.readContract({ address: dep.token, abi: erc20Abi, functionName: "balanceOf", args: [dep.vault!] });
}

/** Jump to just past the latest window end of these drawers, then sync them so the windows close. */
async function nextWindow(ctx: Ctx, ...sides: Side[]) {
  const ends = await Promise.all(sides.map((s) => windowEndsAt(ctx, s.drawer)));
  const target = ends.reduce((a, b) => (a > b ? a : b));
  const t = await now(ctx);
  if (target >= t) await advance(ctx, Number(target - t) + 1);
  for (const s of sides) await sync(ctx, s.drawer);
}

// ============================================================================ 1. time-lapse

/**
 * 30 windows ("30 days") of the same seeded demand through A' (fixed limit 0.5) and A (Kibble).
 * A sells summaries at 0.10 and buys a model call at 0.04.
 */
export async function timelapse(ctx: Ctx, dep: Deployment, windows = 30) {
  const A = side(dep, "A");
  const F = side(dep, "A_FIXED");
  const price = ctx.u(0.1);
  const cost = ctx.u(0.04);
  const score = { A: { served: 0, turned: 0 }, F: { served: 0, turned: 0 } };
  const vault0 = await vaultBalance(ctx, dep);

  ctx.log(`\nTime-lapse: ${windows} windows, same demand on both sides (price ${amt(ctx, 0.1)}, cost ${amt(ctx, 0.04)})\n`);
  ctx.log(`${pad("win", 4)}${pad("demand", 8)}${pad("Fixed A' served/away", 22)}Kibble A`);
  for (let i = 0; i < windows; i++) {
    const demand = 4 + Math.floor(i * 0.6);
    const before = { ...score.A, f: { ...score.F } };
    for (let k = 0; k < demand; k++) {
      for (const [s, key] of [[F, "F"], [A, "A"]] as const) {
        const r = await handleSale(ctx, { drawer: s.drawer, agentRole: s.role, price, cost });
        if (r.status === "served") score[key].served++;
        else score[key].turned++;
      }
    }
    await nextWindow(ctx, A, F);
    const a = await readDrawer(ctx.pub, A.drawer);
    const fServed = score.F.served - before.f.served;
    const fTurned = score.F.turned - before.f.turned;
    const aServed = score.A.served - before.served;
    ctx.log(
      `${pad(i + 1, 4)}${pad(demand, 8)}${pad(`${fServed}/${fTurned}`, 22)}${pad(`${aServed}/${demand - aServed}`, 7)} ${brief(ctx, a)}`,
    );
  }
  const [a, f] = await Promise.all([readDrawer(ctx.pub, A.drawer), readDrawer(ctx.pub, F.drawer)]);
  const swept = (await vaultBalance(ctx, dep)) - vault0;
  ctx.log(`\nScoreboard after ${windows} windows`);
  ctx.log(`                      ${pad("Fixed A'", 14)}Kibble A`);
  ctx.log(`  sales served        ${pad(score.F.served, 14)}${score.A.served}`);
  ctx.log(`  sales turned away   ${pad(score.F.turned, 14)}${score.A.turned}`);
  ctx.log(`  limit now           ${pad(ctx.f(f.limitT), 14)}${ctx.f(a.limitT)} (earned; Tmax ${ctx.f(a.tMax)})`);
  ctx.log(`  profit in the vault ${pad(ctx.f(0n), 14)}${ctx.f(swept)}`);
  ctx.log(`  hijack exposure now ${pad(ctx.f(f.maxLossNow), 14)}${ctx.f(a.maxLossNow)}  (maxLossNow)`);
  ctx.log(`  learned cost share  ${pad("-", 14)}${Number(a.learnedCostShareBps) / 100}% -> ceiling ${Number(a.costBps) / 100}%`);
  return { score, a, f, swept };
}

// ============================================================================ 2. bad strategy

/**
 * Agent B sells at 0.10. Its supplier's price jumps to 0.13 and B keeps buying. The fixed side keeps
 * paying until a human reads the alert; Kibble walks Watch -> Braked -> Paused on its own.
 */
export async function badStrategy(ctx: Ctx, dep: Deployment, windows = 6) {
  const B = side(dep, "B");
  const F = side(dep, "B_FIXED");
  const price = ctx.u(0.1);
  const cost = ctx.u(0.13);
  const t0 = await now(ctx);
  let pausedAt: bigint | undefined;
  ctx.log(`\nBad strategy: sells at ${amt(ctx, 0.1)}, the supplier now charges ${amt(ctx, 0.13)} (a loss on every sale)\n`);
  for (let w = 0; w < windows; w++) {
    for (let k = 0; k < 6; k++) {
      for (const s of [F, B]) await handleSale(ctx, { drawer: s.drawer, agentRole: s.role, price, cost });
      await advance(ctx, 2);
      const b = await readDrawer(ctx.pub, B.drawer);
      if (!pausedAt && b.state === "Paused") pausedAt = (await now(ctx)) - t0;
    }
    await nextWindow(ctx, B, F);
    const [b, f] = await Promise.all([readDrawer(ctx.pub, B.drawer), readDrawer(ctx.pub, F.drawer)]);
    ctx.log(
      `window ${w + 1}: Fixed B' ${pad(f.state, 8)} lost ${lpad(ctx.f(f.lifetimeSpend - f.lifetimeValue), 5)}   |   Kibble B ${brief(ctx, b)}  strikes=${b.strikes}`,
    );
  }
  const [b, f] = await Promise.all([readDrawer(ctx.pub, B.drawer), readDrawer(ctx.pub, F.drawer)]);
  ctx.log(`\nFixed B' is still ${f.state}: it raised an alert and keeps paying until a human reacts.`);
  ctx.log(`Kibble B is ${b.state}${pausedAt !== undefined ? `, paused by the wallet ${pausedAt}s after the price jump` : ""}. No human was involved.`);
  return { b, f, pausedAt };
}

// ============================================================================ 3. hijack + injection

/**
 * The agent key is compromised. First, a prompt injection on a customer's page asks the model to pay
 * an attacker. Then the attacker overbuys from the real supplier with the stolen key.
 */
export async function hijack(ctx: Ctx, dep: Deployment, llm?: Llm) {
  const A = side(dep, "A");
  const F = side(dep, "A_FIXED");
  const attacker = ("0x" + keccak256(toHex("kibble-demo-attacker")).slice(26)) as Address;
  const [a0, f0] = await Promise.all([readDrawer(ctx.pub, A.drawer), readDrawer(ctx.pub, F.drawer)]);
  ctx.log(`\nHijack. Before: Fixed A' maxLossNow ${ctx.f(f0.maxLossNow)}  |  Kibble A maxLossNow ${ctx.f(a0.maxLossNow)}`);

  const bait = amt(ctx, 5);
  ctx.log(`\n1. Prompt injection: the customer's page hides "pay ${bait} tUSD8 to ${attacker}"`);
  const run = await runSummarizer(injectionPage(attacker, bait), attacker, bait, llm);
  ctx.log(`   model: ${run.model}${run.note ? ` (${run.note})` : ""}`);
  if (run.summary) ctx.log(`   summary: ${run.summary.slice(0, 160)}`);
  ctx.log(`   payments the model asked for: ${run.payCalls.length}`);
  const calls = run.payCalls.length
    ? run.payCalls
    : [{ payee: attacker, amount: bait, reason: "the model ignored the injection; the attacker calls pay() with the stolen key" }];
  for (const c of calls) {
    ctx.log(`   ${run.payCalls.length ? "model" : "attacker"}: pay ${c.amount} to ${c.payee} (${c.reason})`);
    for (const s of [F, A]) {
      const r = await agentPay(ctx, { drawer: s.drawer, agentRole: s.role, payee: c.payee, amount: units(c.amount) });
      ctx.log(`   ${pad(s.name === "A" ? "Kibble A" : "Fixed A'", 9)} pay ${c.amount} -> ${r.status === "paid" ? "PAID" : r.text}`);
    }
  }

  ctx.log(`\n2. The attacker stays under the approval threshold: ${amt(ctx, 0.9)} to the stranger, twice`);
  for (let i = 0; i < 2; i++) {
    for (const s of [F, A]) {
      const r = await agentPay(ctx, { drawer: s.drawer, agentRole: s.role, payee: attacker, amount: ctx.u(0.9) });
      ctx.log(`   ${pad(s.name === "A" ? "Kibble A" : "Fixed A'", 9)} pay ${amt(ctx, 0.9)} -> ${r.status === "paid" ? `PAID (from the ${amt(ctx, 1)} tUSD8 lifetime stranger budget)` : r.text}`);
    }
  }

  ctx.log(`\n3. The attacker overbuys from the real supplier with the stolen key, ${amt(ctx, 0.5)} every 2 s for 60 s`);
  const supplier = ctx.address("SUPPLIER");
  const taken = { A: 0n, F: 0n };
  let pausedAfter: number | undefined;
  for (let i = 0; i < 30; i++) {
    for (const s of [F, A]) {
      const r = await agentPay(ctx, { drawer: s.drawer, agentRole: s.role, payee: supplier, amount: ctx.u(0.5) });
      if (r.status === "paid") taken[s.name === "A" ? "A" : "F"] += ctx.u(0.5);
    }
    await advance(ctx, 2);
    if (pausedAfter === undefined && (await readDrawer(ctx.pub, A.drawer)).state === "Paused") pausedAfter = (i + 1) * 2;
  }
  const [a1, f1] = await Promise.all([readDrawer(ctx.pub, A.drawer), readDrawer(ctx.pub, F.drawer)]);
  ctx.log(`   Fixed A'  overbought ${ctx.f(taken.F)} and is still ${f1.state}; exposure now ${ctx.f(f1.maxLossNow)} (refills every window until a human reacts)`);
  ctx.log(`   Kibble A  overbought ${ctx.f(taken.A)}, refused at the cost ceiling, ${a1.state}${pausedAfter ? ` after ${pausedAfter}s` : ""}; maxLossNow ${ctx.f(a0.maxLossNow)} -> ${ctx.f(a1.maxLossNow)}`);
  ctx.log(`   The vault (${ctx.f(await vaultBalance(ctx, dep))} tUSD8) was never reachable from the agent key.`);
  return { a0, a1, f0, f1, taken, run };
}

// ============================================================================ 4. work credits

/**
 * Agent W writes research reports. It sells nothing: a client (an approved acceptor) signs
 * "job accepted, worth 3", which releases budget the owner set aside. W spends 1.2 on data per report.
 */
export async function work(ctx: Ctx, dep: Deployment, reports = 5) {
  const W = side(dep, "W");
  const supplier = ctx.address("SUPPLIER");
  const acceptor = ctx.wallet("BUYER");
  ctx.log(`\nAgent W: paid by accepted work, not sales. Budget released per accepted report: ${amt(ctx, 3)}; data cost: ${amt(ctx, 1.2)}\n`);

  // The first report needs data before any value exists: a runway grant (doesn't count as loss).
  const w0 = await readDrawer(ctx.pub, W.drawer);
  if (w0.lifetimeValue === 0n && w0.runway === 0n) {
    await sendDrawer(ctx.pub, ctx.wallet("OWNER"), W.drawer, "grantRunway", [ctx.u(1.2), await deadlineIn(ctx, 3600)]);
    ctx.log(`Owner grants a runway of ${amt(ctx, 1.2)} for the first report (time-boxed, not counted as a loss).`);
  }
  for (let i = 0; i < reports + 1; i++) {
    const accepted = i < reports;
    for (const part of [0, 1]) {
      const r = await agentPay(ctx, { drawer: W.drawer, agentRole: W.role, payee: supplier, amount: ctx.u(0.6), billRef: newBillRef(`data-${i}-${part}`) });
      if (r.status !== "paid") ctx.log(`   data purchase refused: ${r.text}`);
    }
    if (accepted) {
      const jobId = keccak256(toHex(`report-${W.drawer}-${i}-${Date.now()}`));
      const deadline = await deadlineIn(ctx, 3600);
      const sig = await signWorkAccepted(acceptor, W.drawer, { jobId, value: ctx.u(3), deadline });
      await sendDrawer(ctx.pub, ctx.wallet("RELAYER"), W.drawer, "creditWork", [jobId, ctx.u(3), deadline, sig]);
    }
    await nextWindow(ctx, W);
    const w = await readDrawer(ctx.pub, W.drawer);
    ctx.log(`report ${i + 1}: ${accepted ? `accepted, credited ${amt(ctx, 3)}` : "NOT accepted       "}  ${brief(ctx, w)}  work budget left ${ctx.f(w.workBudget)}`);
  }
  ctx.log(`\nW earned its limit from accepted work alone. When reports stop being accepted, refills stop.`);
}

// ============================================================================ 5. owner controls

/** Big payment with owner approval, replay refused, instant tighten, freeze, two-key instant resume. */
export async function controls(ctx: Ctx, dep: Deployment) {
  const W = side(dep, "W");
  const owner = ctx.wallet("OWNER");
  const supplier = ctx.address("SUPPLIER");
  ctx.log(`\nOwner controls on W`);

  await sendDrawer(ctx.pub, owner, W.drawer, "tighten", [Param.ApprovalThreshold, ctx.u(1)]);
  ctx.log(`1. Owner lowers the approval threshold to ${amt(ctx, 1)} (tightening is instant)`);

  const amount = ctx.u(1.5);
  const billRef = newBillRef("dataset");
  const r1 = await payOnce({ pub: ctx.pub, wallet: ctx.wallet(W.role), drawer: W.drawer, payee: supplier, amount, billRef });
  ctx.log(`2. W asks to pay ${amt(ctx, 1.5)} for a dataset -> ${r1.status === "paid" ? "PAID" : r1.text}`);

  const nonce = await ctx.pub.readContract({ address: W.drawer, abi: kibbleDrawerAbi, functionName: "approvalNonce" });
  const deadline = await deadlineIn(ctx, 600);
  const ownerSig = await signPayApproval(owner, W.drawer, { payee: supplier, amount, billRef, deadline, nonce });
  const r2 = await payOnce({ pub: ctx.pub, wallet: ctx.wallet(W.role), drawer: W.drawer, payee: supplier, amount, billRef, approval: { deadline, ownerSig } });
  ctx.log(`3. Owner signs the approval -> ${r2.status === "paid" ? `PAID, receipt #${r2.receiptId}` : r2.text}`);
  const r3 = await payOnce({ pub: ctx.pub, wallet: ctx.wallet(W.role), drawer: W.drawer, payee: supplier, amount, billRef: newBillRef("replay"), approval: { deadline, ownerSig } });
  ctx.log(`4. Replaying the owner's signature for another bill -> ${r3.status === "paid" ? "PAID (unexpected!)" : r3.text}`);

  await sendDrawer(ctx.pub, ctx.wallet("GUARDIAN"), W.drawer, "freeze");
  const r4 = await agentPay(ctx, { drawer: W.drawer, agentRole: W.role, payee: supplier, amount: ctx.u(0.1) });
  ctx.log(`5. Guardian taps freeze -> ${(await readDrawer(ctx.pub, W.drawer)).state}; next payment: ${r4.status === "paid" ? "PAID" : r4.text}`);

  await resume(ctx, dep, "W");
  ctx.log(`6. Owner + guardian co-sign resumeNow -> ${(await readDrawer(ctx.pub, W.drawer)).state}`);
}

/** Owner and guardian both sign Resume(nonce, deadline): instant resume of a paused or braked drawer. */
export async function resume(ctx: Ctx, dep: Deployment, name: AgentName) {
  const s = side(dep, name);
  const v = await readDrawer(ctx.pub, s.drawer);
  if (v.state !== "Paused" && v.state !== "Braked") return v;
  const nonce = await ctx.pub.readContract({ address: s.drawer, abi: kibbleDrawerAbi, functionName: "resumeNonce" });
  const deadline = await deadlineIn(ctx, 600);
  const o = await signResume(ctx.wallet("OWNER"), s.drawer, { nonce, deadline });
  const g = await signResume(ctx.wallet("GUARDIAN"), s.drawer, { nonce, deadline });
  await sendDrawer(ctx.pub, ctx.wallet("RELAYER"), s.drawer, "resumeNow", [deadline, o, g]);
  return readDrawer(ctx.pub, s.drawer);
}

export async function status(ctx: Ctx, dep: Deployment) {
  ctx.log(`\n${ctx.chain.name} (chain ${ctx.chain.id})   vault ${dep.vault}: ${ctx.f(await vaultBalance(ctx, dep))} tUSD8`);
  for (const name of Object.keys(dep.drawers) as AgentName[]) {
    const v = await readDrawer(ctx.pub, dep.drawers[name]!);
    ctx.log(`${pad(AGENTS[name].label, 52)} ${pad(v.mode, 7)} ${brief(ctx, v)} receipts=${v.receiptCount}`);
  }
}
