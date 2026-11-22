// pnpm --filter @kibble/agents scenario <name> [arg]
//
//   timelapse [windows]   30 windows of the same demand through fixed A' and Kibble A
//   bad-strategy          B's supplier price jumps; fixed keeps paying, Kibble brakes itself
//   hijack                prompt injection, then overbuying with the stolen agent key
//   work [reports]        W earns its limit from signed work acceptances, not sales
//   controls              approval above threshold, replay refused, freeze, two-key resume
//   resume <A|B|W|...>    owner + guardian instant resume
//   status                every drawer at a glance
//   all                   timelapse, bad-strategy, hijack, work, controls
//
// RPC_URL selects the network (default: `make fork` on 127.0.0.1:8555).
import { connect } from "./chain";
import { requireDeployment, type AgentName } from "./deployments";
import { badStrategy, controls, hijack, resume, status, timelapse, work } from "./scenarios";

const [name = "status", arg] = process.argv.slice(2);
const ctx = await connect();
const dep = requireDeployment(ctx.chain.id);
const n = arg ? Number(arg) : undefined;
// On testnet a window is 2 minutes of real time and faucet tUSD8 is scarce: 10 windows by default.
const windows = n ?? (ctx.local ? 30 : 10);

const scenarios: Record<string, () => Promise<unknown>> = {
  timelapse: () => timelapse(ctx, dep, windows),
  "bad-strategy": () => badStrategy(ctx, dep, n ?? 6),
  hijack: () => hijack(ctx, dep),
  work: () => work(ctx, dep, n ?? 5),
  controls: () => controls(ctx, dep),
  resume: async () => console.log(await resume(ctx, dep, (arg ?? "A") as AgentName)),
  status: () => status(ctx, dep),
  all: async () => {
    await timelapse(ctx, dep, windows);
    await badStrategy(ctx, dep);
    await hijack(ctx, dep);
    await work(ctx, dep);
    await controls(ctx, dep);
    await status(ctx, dep);
  },
};

const run = scenarios[name];
if (!run) {
  console.error(`Unknown scenario "${name}". Try: ${Object.keys(scenarios).join(", ")}`);
  process.exit(1);
}
try {
  await run();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
