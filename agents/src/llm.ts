// One small chat client for the demo agents: Claude (official SDK) or an open model on NVIDIA's hosted API.
// Model output is untrusted everywhere: callers validate tool arguments before acting on them.
import Anthropic from "@anthropic-ai/sdk";

/** Which model runs: `scripted` never leaves this machine. */
export type Llm = "claude" | "nvidia" | "scripted";

export const CLAUDE_MODEL = "claude-opus-5-5";
export const NVIDIA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
/** The small, fast model the supplier sells calls to. */
export const NVIDIA_SMALL_MODEL = "nvidia/nemotron-3.5-bolt-e4b";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/** KIBBLE_LLM=off|auto|claude|nvidia picks one; by default, whichever key is set (Claude first). */
export function chooseLlm(env: Record<string, string | undefined> = process.env): Llm {
  const want = env.KIBBLE_LLM?.trim().toLowerCase() || "auto";
  if (want === "off" || want === "scripted") return "scripted";
  if (want === "claude" || want === "nvidia") return want;
  if (want !== "auto") throw new Error(`KIBBLE_LLM=${want} is not one of off, auto, claude, nvidia`);
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return "claude";
  if (env.NVIDIA_API_KEY) return "nvidia";
  return "scripted";
}

export type Tool = { name: string; description: string; parameters: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false } };
export type ToolCall = { id: string; name: string; args: unknown };
export type Msg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls: ToolCall[]; raw?: unknown }
  | { role: "tool"; id: string; content: string };
export type Reply = { model: string; text: string; toolCalls: ToolCall[]; refused: boolean; raw?: unknown };
export type ChatOpts = { system: string; messages: Msg[]; tools?: Tool[]; maxTokens?: number; model?: string };

/** The model can't be reached or the key is wrong. Callers decide whether to fall back. */
export class LlmUnavailable extends Error {}

export async function chat(llm: Llm, opts: ChatOpts): Promise<Reply> {
  if (llm === "claude") return claude(opts);
  if (llm === "nvidia") return nvidia(opts);
  throw new LlmUnavailable("no model chosen (KIBBLE_LLM=off, or no API key)");
}

function parseJson(text: string | undefined): unknown {
  try {
    return JSON.parse(text ?? "");
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------------------------------- NVIDIA

async function nvidia(o: ChatOpts): Promise<Reply> {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) throw new LlmUnavailable("no NVIDIA_API_KEY");
  const model = o.model ?? (process.env.KIBBLE_NVIDIA_MODEL?.trim() || NVIDIA_MODEL);
  const messages = [
    { role: "system", content: o.system },
    ...o.messages.map((m) =>
      m.role === "tool"
        ? { role: "tool", tool_call_id: m.id, content: m.content }
        : m.role === "assistant"
          ? {
              role: "assistant",
              content: m.content || null,
              ...(m.toolCalls.length && {
                tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args ?? {}) } })),
              }),
            }
          : m,
    ),
  ];
  const body = JSON.stringify({
    model,
    max_tokens: o.maxTokens ?? 4096,
    messages,
    ...(o.tools?.length && { tools: o.tools.map((t) => ({ type: "function", function: t })) }),
  });
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        signal: AbortSignal.timeout(120_000),
        body,
      });
    } catch (err) {
      throw new LlmUnavailable(`NVIDIA API unavailable (${err instanceof Error ? err.message : "unknown error"})`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2_000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new LlmUnavailable(`NVIDIA API returned ${res.status}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] | null } }[];
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new LlmUnavailable("NVIDIA API returned no message");
    return {
      model,
      text: (msg.content ?? "").trim(),
      toolCalls: (msg.tool_calls ?? []).map((t, i) => ({ id: t.id ?? `call-${i}`, name: t.function?.name ?? "", args: parseJson(t.function?.arguments) })),
      refused: false,
    };
  }
}

// ------------------------------------------------------------------------------------------- Claude

function claudeMessages(msgs: Msg[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of msgs) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") out.push({ role: "assistant", content: m.raw as Anthropic.Beta.BetaContentBlockParam[] });
    else {
      // every result of one assistant turn goes back in a single user message
      const block: Anthropic.Beta.BetaToolResultBlockParam = { type: "tool_result", tool_use_id: m.id, content: m.content };
      const last = out.at(-1);
      if (last?.role === "user" && Array.isArray(last.content)) last.content.push(block);
      else out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

async function claude(o: ChatOpts): Promise<Reply> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new LlmUnavailable("no ANTHROPIC_API_KEY");
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: o.model ?? CLAUDE_MODEL,
      max_tokens: o.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: o.system,
      ...(o.tools?.length && {
        tools: o.tools.map((t): Anthropic.Beta.BetaTool => ({ name: t.name, description: t.description, strict: true, input_schema: t.parameters })),
      }),
      messages: claudeMessages(o.messages),
    });
    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
      if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, args: block.input });
    }
    return { model: response.model, text: text.trim(), toolCalls, refused: response.stop_reason === "refusal", raw: response.content };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new LlmUnavailable("API credentials rejected");
    if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.RateLimitError) throw new LlmUnavailable(`API unavailable (${err.message})`);
    throw err;
  }
}
