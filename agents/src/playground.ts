// The public playground's three buttons (report section 13.3), run with the demo keys on the server.
// The web app's /api/playground route calls runBeat() one at a time, behind a cooldown and daily limits.
import { erc20Abi } from "viem";
import { readDrawer } from "@kibble/sdk";
import { connect, type Ctx } from "./chain";
import { requireDeployment, type AgentName, type Deployment } from "./deployments";
import { badStrategy, hijack, resume, timelapse } from "./scenarios";

export const BEATS = {
  "sales-rush": {
    title: "Sales rush",
    about: "Two windows of rising demand through the fixed-limit agent and the Kibble agent.",
    drawers: ["A", "A_FIXED"],
  },
  "bad-strategy": {
    title: "Bad strategy",
    about: "The supplier's price jumps above the sale price. The fixed side keeps paying; Kibble brakes itself.",
    drawers: ["B", "B_FIXED"],
  },
  hijack: {
    title: "Hijack",
    about: "A prompt injection, then the attacker overbuys with the stolen agent key for 60 s.",
    drawers: ["A", "A_FIXED"],
  },
} as const satisfies Record<string, { title: string; about: string; drawers: AgentName[] }>;
export type Beat = keyof typeof BEATS;

export function isBeat(x: unknown): x is Beat {
  return typeof x === "string" && x in BEATS;
}

/** The least the buyer and the agents must hold for one beat, before scaling. */
const NEEDS = { buyerTusd8: 1.5, gasWei: 5n * 10n ** 15n };

async function preflight(ctx: Ctx, dep: Deployment) {
  const buyer = await ctx.pub.readContract({ address: dep.token, abi: erc20Abi, functionName: "balanceOf", args: [ctx.address("BUYER")] });
  if (buyer < ctx.u(NEEDS.buyerTusd8)) {
    throw new Error(`The demo buyer is out of tUSD8 (${ctx.f(buyer)} left). The playground is paused until it's topped up.`);
  }
  for (const role of ["BUYER", "AGENT_A", "AGENT_B", "RELAYER"] as const) {
    if ((await ctx.pub.getBalance({ address: ctx.address(role) })) < NEEDS.gasWei) {
      throw new Error(`The demo ${role} wallet is out of gas. The playground is paused until it's topped up.`);
    }
  }
}

/**
 * Run one beat. Drawers a previous run paused are resumed first (owner + guardian co-sign), so every
 * visitor sees the full story.
 */
export async function runBeat(beat: Beat, opts: { rpcUrl: string; log: (line: string) => void }) {
  const log = (...args: unknown[]) => opts.log(args.map(String).join(" "));
  const ctx = await connect(opts.rpcUrl, log);
  const dep = requireDeployment(ctx.chain.id);
  await preflight(ctx, dep);
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
