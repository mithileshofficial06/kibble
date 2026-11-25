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
// About 40 beats fit in the demo wallets' testnet gas (0.6 tQDAY at ~0.015 a beat), so 10 a day spreads it over judging.
const RUNS_PER_DAY = Number(process.env.PLAYGROUND_RUNS_PER_DAY ?? 10);
/** Below this many beats of gas left, the page says so. */
const FUEL_LOW = 5;
const MAX_LINES = 400;
const MAX_EVENTS = 800;

import type { StoryEvent } from "@kibble/sdk";

type Job = { id: number; beat: string; startedAt: number; expectedSeconds: number; finishedAt?: number; ok?: boolean; lines: string[]; events: StoryEvent[] };
type State = {
  job?: Job;
  nextId: number;
  lastEnd: number;
  day: string;
  runs: number;
  perIp: Map<string, number>;
  /** How long each beat really took last time it finished OK, in seconds. */
  took: Record<string, number>;
  /** Beats the demo wallets' gas still pays for, and when that was read. */
  fuel?: { beats: number; at: number };
};

// Survives hot reloads in `next dev`.
const g = globalThis as unknown as { __kibblePlayground?: State };
const state: State = (g.__kibblePlayground ??= { nextId: 1, lastEnd: 0, day: "", runs: 0, perIp: new Map(), took: {} });
state.took ??= {};

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

type Beats = Awaited<ReturnType<typeof loadBeats>>["BEATS"];

/** What the page needs about each beat (the gas table holds bigints, which JSON can't carry). */
function publicBeats(BEATS: Beats) {
  return Object.fromEntries(
    Object.entries(BEATS).map(([key, b]) => [key, { title: b.title, about: b.about, drawers: b.drawers, estSeconds: estimate(BEATS, key) }]),
  );
}

function estimate(BEATS: Beats, key: string) {
  return state.took[key] ?? BEATS[key as keyof Beats].estSeconds;
}

function rpcUrl() {
  return process.env.PLAYGROUND_RPC_URL?.trim() || "https://rpc-test.qday.info";
}

/** Re-read the gas left at most once a minute (and after every run). A read error leaves it unknown. */
async function refreshFuel(force = false) {
  if (!enabled() || (!force && state.fuel && Date.now() - state.fuel.at < 60_000)) return;
  try {
    const { fuel } = await loadBeats();
    const beats = await fuel(rpcUrl());
    state.fuel = { beats: Number.isFinite(beats) ? beats : 9999, at: Date.now() };
  } catch {
    state.fuel = undefined;
  }
}

/** The job as sent to the page: only the events after `since`, so polling stays light. */
function jobView(since: number) {
  if (!state.job) return undefined;
  const { events, ...rest } = state.job;
  return { ...rest, events: events.slice(since), eventCount: events.length };
}

function view(since = 0) {
  rollDay();
  const running = Boolean(state.job && state.job.finishedAt === undefined);
  const fuel = state.fuel?.beats;
  return {
    enabled: enabled(),
    running,
    job: jobView(since),
    cooldownEndsAt: running || !state.lastEnd ? null : state.lastEnd + COOLDOWN_MS,
    runsLeftToday: Math.max(0, RUNS_PER_DAY - state.runs),
    /** Roughly how many more runs the demo wallets' testnet gas pays for; null if unknown. */
    fuelRuns: fuel ?? null,
    fuelLow: fuel !== undefined && fuel < FUEL_LOW,
  };
}

async function loadBeats() {
  // The agents package resolves deployments/<chainId>.json from the repo root.
  process.env.KIBBLE_ROOT ??= resolve(process.cwd(), "..");
  return import("@kibble/agents/playground");
}

export async function GET(req: NextRequest) {
  const { BEATS } = await loadBeats();
  await refreshFuel();
  const since = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("since")) || 0));
  return NextResponse.json({ ...view(since), beats: publicBeats(BEATS) });
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

  if (state.fuel && state.fuel.beats < 1) {
    return NextResponse.json({ error: "The demo wallets are out of testnet gas. The playground is paused until they're topped up." }, { status: 503 });
  }

  const beat = body.beat;
  const job: Job = { id: state.nextId++, beat, startedAt: now, expectedSeconds: estimate(BEATS, beat), lines: [], events: [] };
  state.job = job;
  state.runs++;
  state.perIp.set(ip, (state.perIp.get(ip) ?? 0) + 1);
  const log = (line: string) => {
    job.lines.push(line);
    if (job.lines.length > MAX_LINES) job.lines.splice(0, job.lines.length - MAX_LINES);
  };
  // Runs in the background; the page polls GET for the log.
  const event = (e: StoryEvent) => {
    if (job.events.length < MAX_EVENTS) job.events.push(e);
  };
  void runBeat(beat, { rpcUrl: rpcUrl(), log, event })
    .then(() => {
      job.ok = true;
      state.took[beat] = Math.round((Date.now() - job.startedAt) / 1000);
    })
    .catch((e: unknown) => {
      job.ok = false;
      // viem errors carry the call and its arguments; the short message is enough for visitors.
      const short = (e as { shortMessage?: string })?.shortMessage;
      log(`Stopped: ${short ?? (e instanceof Error ? e.message : String(e))}`);
    })
    .finally(() => {
      job.finishedAt = Date.now();
      state.lastEnd = job.finishedAt;
      void refreshFuel(true);
    });
  return NextResponse.json({ ...view(), beats: publicBeats(BEATS) }, { status: 202 });
}
