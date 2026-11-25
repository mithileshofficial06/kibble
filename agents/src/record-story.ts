// Record the three demos as story events for the app's instant replays and tour.
//   RPC_URL=… tsx src/record-story.ts     (default: the local fork; run setup-demo first)
// On a local fork the events are the real contracts' decisions on a copy of Aevum, and the file says so.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Story, StoryEvent } from "@kibble/sdk";
import { atDeploymentScale, connect } from "./chain";
import { requireDeployment, ROOT, type AgentName } from "./deployments";
import { badStrategy, hijack, resume, timelapse } from "./scenarios";
import { StoryTeller } from "./story";

const raw = await connect(undefined, (...a) => console.log(...a));
const dep = requireDeployment(raw.chain.id);
const base = atDeploymentScale(raw, dep.scale);
const onChain = !base.local;
const source = onChain ? "Recorded on Aevum testnet" : "Recorded on a local copy of Aevum testnet: the same contracts, run by the same scripts";

async function record(id: string, title: string, fixed: AgentName, kibble: AgentName, go: (ctx: typeof base) => Promise<unknown>): Promise<Story> {
  const events: StoryEvent[] = [];
  const ctx = { ...base };
  ctx.story = new StoryTeller(ctx, dep, (e) => events.push(e));
  await ctx.story.start(dep.drawers[fixed]!, dep.drawers[kibble]!);
  await go(ctx);
  await ctx.story.end(dep.drawers[fixed]!, dep.drawers[kibble]!);
  return { id, title, source, recorded: new Date().toISOString().slice(0, 10), onChain, events };
}

// Let the good seller finish learning first, off the record.
await timelapse(base, dep, 8);
const out = join(ROOT, "web", "src", "stories");
mkdirSync(out, { recursive: true });
const save = (s: Story) => {
  writeFileSync(join(out, `${s.id}.json`), JSON.stringify(s) + "\n");
  console.log(`${s.id}: ${s.events.length} events`);
};
save(await record("sales-rush", "A busy day", "A_FIXED", "A", (ctx) => timelapse(ctx, dep, 2, 14)));
save(await record("bad-strategy", "A losing day", "B_FIXED", "B", (ctx) => badStrategy(ctx, dep, 2)));
save(await record("hijack", "A stolen key", "A_FIXED", "A", (ctx) => hijack(ctx, dep, "scripted")));
await resume(base, dep, "A");
