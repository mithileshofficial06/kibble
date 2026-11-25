// The owner's assistant. Reads one drawer from the chain and answers; it can't send or sign anything.
// KIBBLE_ASSISTANT=nvidia|claude picks the model; unset, it answers from the chain without a model.
// Limits protect the API key: per visitor and per day, kept in this server process.
import { NextResponse, type NextRequest } from "next/server";
import { isAddress, type Address } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_IP_PER_DAY = Number(process.env.ASSISTANT_PER_IP_PER_DAY ?? 20);
const PER_DAY = Number(process.env.ASSISTANT_PER_DAY ?? 200);
const MAX_BUSY = 3;
const MAX_TURNS = 7;
const MAX_CHARS = 600;

type State = { day: string; total: number; perIp: Map<string, number>; busy: number };
const g = globalThis as unknown as { __kibbleAssistant?: State };
const state: State = (g.__kibbleAssistant ??= { day: "", total: 0, perIp: new Map(), busy: 0 });

function clientIp(req: NextRequest) {
  const trusted = process.env.TRUSTED_IP_HEADER;
  if (trusted) return req.headers.get(trusted)?.split(",")[0].trim() || "unknown";
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",").at(-1)!.trim() : "local";
}

const bad = (error: string, status: number) => NextResponse.json({ error }, { status });

type Turn = { role: "user" | "assistant"; text: string };
function parseTurns(x: unknown): Turn[] | null {
  if (!Array.isArray(x) || !x.length || x.length > MAX_TURNS) return null;
  const out: Turn[] = [];
  for (const t of x as { role?: unknown; text?: unknown }[]) {
    if ((t?.role !== "user" && t?.role !== "assistant") || typeof t.text !== "string" || !t.text.trim()) return null;
    out.push({ role: t.role, text: t.text.slice(0, t.role === "user" ? MAX_CHARS : 1_200) });
  }
  return out.at(-1)!.role === "user" ? out : null;
}

export async function GET() {
  const { assistantLlm } = await import("@kibble/agents/assistant");
  return NextResponse.json({ model: assistantLlm() !== "scripted" });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 12_000) return bad("That message is too long.", 413);
  let body: { drawer?: unknown; turns?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return bad("Bad request.", 400);
  }
  if (typeof body.drawer !== "string" || !isAddress(body.drawer)) return bad("Pick a drawer.", 400);
  const turns = parseTurns(body.turns);
  if (!turns) return bad("Ask a question.", 400);

  const today = new Date().toISOString().slice(0, 10);
  if (state.day !== today) Object.assign(state, { day: today, total: 0, perIp: new Map() });
  const ip = clientIp(req);
  if (state.busy >= MAX_BUSY) return bad("A few people are asking at once. Try again in a moment.", 429);
  if (state.total >= PER_DAY) return bad("Today's questions are used up. Come back tomorrow (UTC).", 429);
  if ((state.perIp.get(ip) ?? 0) >= PER_IP_PER_DAY) return bad(`You've used your ${PER_IP_PER_DAY} questions for today.`, 429);
  state.total++;
  state.perIp.set(ip, (state.perIp.get(ip) ?? 0) + 1);
  state.busy++;
  try {
    const { ask, assistantLlm } = await import("@kibble/agents/assistant");
    const answer = await ask({
      rpcUrl: process.env.PLAYGROUND_RPC_URL?.trim() || "https://rpc-test.qday.info",
      drawer: body.drawer as Address,
      turns,
      llm: assistantLlm(),
    });
    return NextResponse.json(answer);
  } catch {
    return bad("Couldn't read that drawer. Check the address, or try again.", 502);
  } finally {
    state.busy--;
  }
}
