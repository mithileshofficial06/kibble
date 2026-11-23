// The public playground's three buttons (report section 13.3), run with the demo keys on the server.
// The web app's /api/playground route calls runBeat() one at a time, behind a cooldown and daily limits.
import { erc20Abi } from "viem";
import { readDrawer } from "@kibble/sdk";
import { atDeploymentScale, connect, type Ctx } from "./chain";
import { requireDeployment, type AgentName, type Deployment } from "./deployments";
import { badStrategy, hijack, resume, timelapse } from "./scenarios";
import { beatsAffordable, gasBalances, rebalanceGas, recycleTusd8, SENDERS, tq, type Sender } from "./upkeep";

const m = (milli: number) => BigInt(milli) * 10n ** 15n; // milli-tQDAY in wei

export const BEATS = {
  "sales-rush": {
    title: "Sales rush",
    about: "Two windows of rising demand through the fixed-limit agent and the Kibble agent.",
    drawers: ["A", "A_FIXED"],
    /** Rough length on Aevum testnet (2-minute windows, 1 s blocks). The server replaces it with the last real run. */
    estSeconds: 300,
    /** Gas per sender, measured on the fork at 1 gwei (Aevum's price) with 1.5x headroom. */
    gas: { BUYER: m(9), AGENT_A: m(8), RELAYER: m(2) },
  },
  "bad-strategy": {
    title: "Bad strategy",
    about: "The supplier's price jumps above the sale price. The fixed side keeps paying; Kibble brakes itself.",
    drawers: ["B", "B_FIXED"],
    estSeconds: 420,
    gas: { BUYER: m(11), AGENT_B: m(11), RELAYER: m(2) },
  },
  hijack: {
    title: "Hijack",
    about: "A prompt injection, then the attacker overbuys with the stolen agent key for 60 s.",
    drawers: ["A", "A_FIXED"],
    estSeconds: 210,
    gas: { AGENT_A: m(10), RELAYER: m(2) },
  },
} as const satisfies Record<string, { title: string; about: string; drawers: AgentName[]; estSeconds: number; gas: Partial<Record<Sender, bigint>> }>;
export type Beat = keyof typeof BEATS;

export function isBeat(x: unknown): x is Beat {
  return typeof x === "string" && x in BEATS;
}

/** The least the buyer must hold for one beat, before scaling. */
const BUYER_TUSD8 = 1.5;

/** Gas per sender for any one beat: the most any beat needs (the owner shares gas out before each run). */
const PER_BEAT = Object.fromEntries(
  SENDERS.map((r) => [r, Object.values(BEATS).reduce((a, b) => ((b.gas as Partial<Record<Sender, bigint>>)[r] ?? 0n) > a ? (b.gas as Partial<Record<Sender, bigint>>)[r]! : a, 0n)]),
) as Record<Sender, bigint>;

/**
 * Before a beat: move tUSD8 the beats sent to the supplier back to the buyer and the vault, and have
 * the owner send gas to any sender running low. Then check this beat can finish.
 */
async function upkeep(ctx: Ctx, dep: Deployment, beat: Beat, log: (line: string) => void) {
  await recycleTusd8(ctx, dep, log);
  await rebalanceGas(ctx, PER_BEAT, log);
  const buyer = await ctx.pub.readContract({ address: dep.token, abi: erc20Abi, functionName: "balanceOf", args: [ctx.address("BUYER")] });
  if (beat !== "hijack" && buyer < ctx.u(BUYER_TUSD8)) {
    throw new Error(`The demo buyer is out of tUSD8 (${ctx.f(buyer)} left). The playground is paused until it's topped up.`);
  }
  const bal = await gasBalances(ctx);
  for (const [role, need] of Object.entries(BEATS[beat].gas) as [Sender, bigint][]) {
    if (bal[role] < need) throw new Error(`The demo ${role} wallet is out of gas (${tq(bal[role])} tQDAY). The playground is paused until it's topped up.`);
  }
}

/** How many more beats the demo wallets' gas pays for (read-only). */
export async function fuel(rpcUrl: string) {
  const ctx = await connect(rpcUrl, () => undefined);
  return beatsAffordable(await gasBalances(ctx), PER_BEAT);
}

/**
 * Run one beat. Drawers a previous run paused are resumed first (owner + guardian co-sign), so every
 * visitor sees the full story.
 */
export async function runBeat(beat: Beat, opts: { rpcUrl: string; log: (line: string) => void }) {
  const log = (...args: unknown[]) => opts.log(args.map(String).join(" "));
  const raw = await connect(opts.rpcUrl, log);
  const dep = requireDeployment(raw.chain.id);
  const ctx = atDeploymentScale(raw, dep.scale);
  await upkeep(ctx, dep, beat, log);
  for (const name of BEATS[beat].drawers) {
    const v = await readDrawer(ctx.pub, dep.drawers[name]!);
    if (v.state === "Paused" || v.state === "Braked") {
      const after = await resume(ctx, dep, name);
      log(`Reset: ${name} was ${v.state}; owner + guardian co-signed resumeNow -> ${after.state}`);
    }
  }
  if (beat === "sales-rush") await timelapse(ctx, dep, 2);
  else if (beat === "bad-strategy") await badStrategy(ctx, dep, 3);
  else await hijack(ctx, dep);
}
