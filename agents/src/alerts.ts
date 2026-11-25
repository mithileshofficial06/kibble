// Watch drawers and message the owner (Telegram, or the console when no bot is set up).
//
//   pnpm --filter @kibble/agents alerts [0xDrawer …]      (default: the demo drawers)
//
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID turn Telegram on. ALERT_POLL_S (default 20) sets how often to look.
// It only reads the chain: it holds no key and can't act.
import { pathToFileURL } from "node:url";
import { createPublicClient, http, isAddress, type Address, type PublicClient } from "viem";
import { decodeDrawerLogsFrom, fmt, readDrawer, REASON_TEXT, REASONS, STATES, type DrawerView, type ReasonName } from "@kibble/sdk";
import { loadDeployment, type AgentName } from "./deployments";

export type Level = "info" | "warn" | "stop";
export type Message = { level: Level; text: string };

type Event = { eventName: string; args: Record<string, unknown> };
const m = (v: bigint) => fmt(v, 4);

/** What these events mean for the owner, in plain words. Pure, so it's easy to test. */
export function messagesFor(name: string, events: Event[], v: DrawerView): Message[] {
  const out: Message[] = [];
  const refused = new Map<string, { n: number; total: bigint }>();
  let refunds = 0;
  for (const { eventName, args: a } of events) {
    if (eventName === "StateChanged") {
      const to = STATES[Number(a.to)] ?? "?";
      const why = REASON_TEXT[(REASONS[Number(a.why)] ?? "None") as ReasonName];
      const level: Level = to === "Paused" || to === "Revoked" ? "stop" : to === "Watch" || to === "Braked" ? "warn" : "info";
      out.push({ level, text: `${name} is now ${to}. ${why}.` });
    } else if (eventName === "Refused") {
      const why = REASON_TEXT[(REASONS[Number(a.reason)] ?? "None") as ReasonName];
      const r = refused.get(why) ?? { n: 0, total: 0n };
      refused.set(why, { n: r.n + 1, total: r.total + (a.amount as bigint) });
    } else if (eventName === "Alert") {
      out.push({ level: "warn", text: `${name} lost ${m(a.loss as bigint)} tUSD8 in window ${a.windowIndex}. It keeps paying until someone acts.` });
    } else if (eventName === "UnexplainedOutflow") {
      out.push({ level: "stop", text: `${name}: ${m(a.amount as bigint)} tUSD8 left without a payment.` });
    } else if (eventName === "Refunded") {
      refunds++;
    } else if (eventName === "TrackRecord") {
      const value = a.value as bigint;
      const spend = a.spend as bigint;
      if (value === 0n && spend > 0n) {
        out.push({ level: "warn", text: `${name} spent ${m(spend)} tUSD8 in a window with no sales (a slow drip looks like this).` });
      } else if (v.mode === "EARNED" && v.state !== "Learning" && value > 0n && (spend * 10_000n) / value > v.learnedCostShareBps + 300n) {
        out.push({
          level: "warn",
          text: `${name} spent ${Number((spend * 1_000n) / value) / 10}% of what it earned; its normal share is ${Number(v.learnedCostShareBps) / 100}% (a skim looks like this).`,
        });
      }
    }
  }
  for (const [why, r] of refused) out.push({ level: "warn", text: `${name}: ${r.n} payment(s) totalling ${m(r.total)} tUSD8. ${why}.` });
  if (refunds >= 3) out.push({ level: "warn", text: `${name} refunded ${refunds} customers.` });
  if (v.state !== "Paused" && v.state !== "Revoked" && v.limitT > 0n && v.pendingTotal > 3n * v.limitT) {
    out.push({ level: "warn", text: `${name} holds ${m(v.pendingTotal)} tUSD8 of orders nobody has confirmed. Check that customers are being served.` });
  }
  return out;
}

export async function send(msgs: Message[], env: Record<string, string | undefined> = process.env): Promise<void> {
  if (!msgs.length) return;
  const icon = { info: "ℹ️", warn: "⚠️", stop: "🛑" } as const;
  const text = msgs.map((x) => `${icon[x.level]} ${x.text}`).join("\n").slice(0, 3_900);
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) {
    console.log(text);
    return;
  }
  const base = env.TELEGRAM_API?.trim() || "https://api.telegram.org";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${base}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) return;
      if (r.status === 401 || r.status === 400 || r.status === 403) {
        console.error(`Telegram refused the message (${r.status}). Check the bot token and chat ID.`);
        break;
      }
    } catch {
      // try again below; never print the error, its URL contains the token
    }
    await new Promise((res) => setTimeout(res, 1_000 * 2 ** attempt));
  }
  console.log(text);
}

const SPAN = 1_000n;

/** One look: everything since `from`. Returns the messages and where to continue. */
export async function look(pub: PublicClient, drawers: [string, Address][], from: bigint): Promise<{ msgs: Message[]; next: bigint }> {
  const head = await pub.getBlockNumber();
  if (head < from) return { msgs: [], next: from };
  const msgs: Message[] = [];
  for (const [name, address] of drawers) {
    const events: Event[] = [];
    for (let b = from; b <= head; b += SPAN) {
      const logs = await pub.getLogs({ address, fromBlock: b, toBlock: b + SPAN - 1n > head ? head : b + SPAN - 1n });
      events.push(...decodeDrawerLogsFrom(logs));
    }
    if (events.length) msgs.push(...messagesFor(name, events, await readDrawer(pub, address)));
  }
  return { msgs, next: head + 1n };
}

async function main() {
  const rpc = process.env.RPC_URL?.trim() || "https://rpc-test.qday.info";
  const pub = createPublicClient({ transport: http(rpc) }) as PublicClient;
  const chainId = await pub.getChainId();
  const args = process.argv.slice(2).filter((a) => isAddress(a)) as Address[];
  const dep = loadDeployment(chainId);
  const drawers: [string, Address][] = args.length
    ? args.map((a) => [`Agent ${a.slice(0, 6)}…${a.slice(-4)}`, a])
    : (Object.entries(dep?.drawers ?? {}) as [AgentName, Address][]).map(([n, a]) => [`Agent ${n.replace("_FIXED", "′")}`, a]);
  if (!drawers.length) throw new Error("Nothing to watch: pass drawer addresses.");
  const on = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  console.log(`Watching ${drawers.length} drawer(s) on chain ${chainId}; alerts go to ${on ? "Telegram" : "this console"}.`);
  let next = (await pub.getBlockNumber()) + 1n;
  const every = Math.max(5, Number(process.env.ALERT_POLL_S ?? 20)) * 1000;
  for (;;) {
    try {
      const r = await look(pub, drawers, next);
      await send(r.msgs);
      next = r.next;
    } catch {
      console.error("Couldn't read the chain; trying again.");
    }
    await new Promise((res) => setTimeout(res, every));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
