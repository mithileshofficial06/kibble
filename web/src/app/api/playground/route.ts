// Public playground (report section 13.3): three no-wallet buttons run through the demo keys on the server.
//
// Off unless KIBBLE_PLAYGROUND=on. Needs the demo keys (KIBBLE_WALLETS=<path to .env>, or
// OWNER_/GUARDIAN_/AGENT_A_/AGENT_B_/SUPPLIER_/BUYER_/RELAYER_PRIVATE_KEY) and PLAYGROUND_RPC_URL.
// Limits: one run at a time, a global cooldown, a per-IP daily limit and a global daily limit.
// State lives in this server process, so run it with `next start` (a long-running server), not
// short-lived serverless functions.
import { resolve } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOLDOWN_MS = Number(process.env.PLAYGROUND_COOLDOWN_S ?? 60) * 1000;
const PER_IP_PER_DAY = Number(process.env.PLAYGROUND_PER_IP_PER_DAY ?? 3);
const RUNS_PER_DAY = Number(process.env.PLAYGROUND_RUNS_PER_DAY ?? 20);
const MAX_LINES = 400;

type Job = { id: number; beat: string; startedAt: number; finishedAt?: number; ok?: boolean; lines: string[] };
type State = { job?: Job; nextId: number; lastEnd: number; day: string; runs: number; perIp: Map<string, number> };

// Survives hot reloads in `next dev`.
const g = globalThis as unknown as { __kibblePlayground?: State };
const state: State = (g.__kibblePlayground ??= { nextId: 1, lastEnd: 0, day: "", runs: 0, perIp: new Map() });

function enabled() {
  return process.env.KIBBLE_PLAYGROUND === "on";
}

function clientIp(req: NextRequest) {
  const trusted = process.env.TRUSTED_IP_HEADER;
  if (trusted) return req.headers.get(trusted)?.split(",")[0].trim() || "unknown";
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",").at(-1)!.trim() : "local";
}

function rollDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.day !== today) {
    state.day = today;
    state.runs = 0;
    state.perIp.clear();
  }
}

function view() {
  rollDay();
  const running = Boolean(state.job && state.job.finishedAt === undefined);
  return {
    enabled: enabled(),
    running,
    job: state.job,
    cooldownEndsAt: running ? null : state.lastEnd + COOLDOWN_MS,
    runsLeftToday: Math.max(0, RUNS_PER_DAY - state.runs),
  };
}

async function loadBeats() {
  // The agents package resolves deployments/<chainId>.json from the repo root.
  process.env.KIBBLE_ROOT ??= resolve(process.cwd(), "..");
  return import("@kibble/agents/playground");
}

export async function GET() {
  const { BEATS } = await loadBeats();
  return NextResponse.json({ ...view(), beats: BEATS });
}

export async function POST(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "The playground is switched off on this server." }, { status: 503 });
  const { BEATS, isBeat, runBeat } = await loadBeats();
  const body = (await req.json().catch(() => ({}))) as { beat?: unknown };
  if (!isBeat(body.beat)) return NextResponse.json({ error: `Pick one of: ${Object.keys(BEATS).join(", ")}` }, { status: 400 });

  rollDay();
  const now = Date.now();
  if (state.job && state.job.finishedAt === undefined) return NextResponse.json({ error: "Another run is in progress. Watch it below." }, { status: 409 });
  if (now < state.lastEnd + COOLDOWN_MS) {
    return NextResponse.json({ error: `Cooling down: try again in ${Math.ceil((state.lastEnd + COOLDOWN_MS - now) / 1000)} s.` }, { status: 429 });
  }
  if (state.runs >= RUNS_PER_DAY) return NextResponse.json({ error: "Today's runs are used up. Come back tomorrow (UTC)." }, { status: 429 });
  const ip = clientIp(req);
  if ((state.perIp.get(ip) ?? 0) >= PER_IP_PER_DAY) {
    return NextResponse.json({ error: `You've used your ${PER_IP_PER_DAY} runs for today.` }, { status: 429 });
  }

  const rpcUrl = process.env.PLAYGROUND_RPC_URL?.trim() || "https://rpc-test.qday.info";
  const job: Job = { id: state.nextId++, beat: body.beat, startedAt: now, lines: [] };
  state.job = job;
  state.runs++;
  state.perIp.set(ip, (state.perIp.get(ip) ?? 0) + 1);
  const log = (line: string) => {
    job.lines.push(line);
    if (job.lines.length > MAX_LINES) job.lines.splice(0, job.lines.length - MAX_LINES);
  };
  // Runs in the background; the page polls GET for the log.
  void runBeat(body.beat, { rpcUrl, log })
    .then(() => (job.ok = true))
    .catch((e: unknown) => {
      job.ok = false;
      log(`Stopped: ${e instanceof Error ? e.message : String(e)}`);
    })
    .finally(() => {
      job.finishedAt = Date.now();
      state.lastEnd = job.finishedAt;
    });
  return NextResponse.json(view(), { status: 202 });
}
