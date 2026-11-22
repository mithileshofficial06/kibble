// The supplier as a standalone HTTP service (port 8787):
//
//   POST /call  {"drawer":"0x…","billRef":"0x…","amount":"40000","txHash":"0x…","prompt":"…"}
//   -> 200 {"result":"…"} once the Paid event checks out, 402 otherwise.
//
// The scenario runner calls the same verifyPaid() in-process, so the demo doesn't need this running.
import { createServer } from "node:http";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { connect } from "./chain";
import { runModelCall, verifyPaid } from "./supplier";

const PORT = Number(process.env.SUPPLIER_PORT ?? 8787);
const ctx = await connect();
const supplier = ctx.address("SUPPLIER");

createServer(async (req, res) => {
  const reply = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST" || req.url !== "/call") return reply(404, { error: "POST /call" });
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) return reply(413, { error: "too large" });
  }
  try {
    const b = JSON.parse(raw) as { drawer: string; billRef: string; amount: string; txHash: string; prompt?: string };
    if (!isAddress(b.drawer) || !isHex(b.billRef) || !isHex(b.txHash) || !/^\d+$/.test(b.amount)) {
      return reply(400, { error: "bad request" });
    }
    const paid = await verifyPaid(ctx, {
      txHash: b.txHash as Hex,
      drawer: b.drawer as Address,
      billRef: b.billRef as Hex,
      amount: BigInt(b.amount),
      supplier,
    });
    if (!paid) return reply(402, { error: "no matching Paid event to this supplier" });
    return reply(200, { result: runModelCall(b.prompt ?? "") });
  } catch {
    return reply(400, { error: "bad request" });
  }
}).listen(PORT, () => console.log(`Supplier ${supplier} listening on http://localhost:${PORT}/call (${ctx.chain.name})`));
