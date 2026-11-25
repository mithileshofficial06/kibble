// The public playground's three buttons (report section 13.3), run with the demo keys on the server.
// The web app's /api/playground route calls runBeat() one at a time, behind a cooldown and daily limits.
import { erc20Abi } from "viem";
import { readDrawer } from "@kibble/sdk";
import { atDeploymentScale, connect, type Ctx } from "./chain";
import { requireDeployment, type AgentName, type Deployment } from "./deployments";
import { badStrategy, hijack, resume, timelapse } from "./scenarios";
import type { StoryEvent } from "@kibble/sdk";
import { STORY_PAIR, StoryTeller } from "./story";
import { beatsAffordable, gasBalances, rebalanceGas, recycleTusd8, SENDERS, tq, type Sender } from "./upkeep";

const m = (milli: number) => BigInt(milli) * 10n ** 15n; // milli-tQDAY in wei

export const BEATS = {
  "sales-rush": {
    title: "A busy day",
    about: "Customers keep coming. See which agent can serve them, and whose limit grows.",
    drawers: ["A", "A_FIXED"],
    /** Rough length on Aevum testnet (2-minute windows, 1 s blocks). The server replaces it with the last real run. */
    estSeconds: 300,
    /** Gas per sender, measured on the fork at 1 gwei (Aevum's price) with 1.5x headroom. */
    gas: { BUYER: m(9), AGENT_A: m(8), RELAYER: m(2) },
  },
  "bad-strategy": {
    title: "A losing day",
    about: "Every sale starts losing money. One agent keeps paying. The other is stopped by its wallet.",
    drawers: ["B", "B_FIXED"],
    estSeconds: 420,
    gas: { BUYER: m(11), AGENT_B: m(11), RELAYER: m(2) },
  },
  hijack: {
    title: "A stolen key",
    about: "A web page tricks the AI, then a thief uses its key. See how much each wallet gives away.",
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

/** Average total gas of one beat (visitors pick beats about evenly). */
const AVG_BEAT =
  Object.values(BEATS).reduce((a, b) => a + Object.values(b.gas as Partial<Record<Sender, bigint>>).reduce((x, y) => x + (y ?? 0n), 0n), 0n) /
  BigInt(Object.keys(BEATS).length);

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
  return beatsAffordable(await gasBalances(ctx), AVG_BEAT);
}

/**
 * Run one beat. Drawers a previous run paused are resumed first (owner + guardian co-sign), so every
 * visitor sees the full story.
 */
export async function runBeat(beat: Beat, opts: { rpcUrl: string; log: (line: string) => void; event?: (e: StoryEvent) => void }) {
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
  const [fixed, kibble] = STORY_PAIR[beat];
  if (opts.event) {
    ctx.story = new StoryTeller(ctx, dep, opts.event);
    await ctx.story.start(dep.drawers[fixed]!, dep.drawers[kibble]!);
  }
  if (beat === "sales-rush") await timelapse(ctx, dep, 2);
  else if (beat === "bad-strategy") await badStrategy(ctx, dep, 3);
  // Always the scripted model here: visitors can never spend API keys that are on the server.
  else await hijack(ctx, dep, "scripted");
  await ctx.story?.end(dep.drawers[fixed]!, dep.drawers[kibble]!);
}
