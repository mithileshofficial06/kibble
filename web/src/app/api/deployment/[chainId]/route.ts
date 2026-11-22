// The demo deployment for a local chain (`make fork` / `make anvil`), read from deployments/<chainId>.json.
// Aevum testnet's deployment is built into the app (src/lib/kibble.ts), so this is only for local runs.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ chainId: string }> }) {
  const { chainId } = await ctx.params;
  if (!/^\d+$/.test(chainId)) return NextResponse.json({ error: "bad chain id" }, { status: 400 });
  try {
    const file = resolve(process.cwd(), "..", "deployments", `${chainId}.json`);
    return NextResponse.json(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return NextResponse.json({ error: `no deployment for chain ${chainId}` }, { status: 404 });
  }
}
