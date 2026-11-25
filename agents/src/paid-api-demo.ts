// pnpm --filter @kibble/agents paid-api [serve]
//   (no argument)  start the API, buy from it with a wallet that has no gas, and try to cheat it (local chains)
//   serve          keep it running on PAID_API_PORT (default 8788)
import type { AddressInfo } from "node:net";
import { erc20Abi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buyerStats, paidFetch, signPayment, readDrawer, type PaymentTerms } from "@kibble/sdk";
import { atDeploymentScale, connect } from "./chain";
import { requireDeployment } from "./deployments";
import { chooseLlm } from "./llm";
import { paidApi } from "./paid-api";

const raw = await connect();
const dep = requireDeployment(raw.chain.id);
const ctx = atDeploymentScale(raw, dep.scale);
const server = paidApi(ctx, dep, chooseLlm());
const serve = process.argv[2] === "serve";
await new Promise<void>((r) => server.listen(serve ? Number(process.env.PAID_API_PORT ?? 8788) : 0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/summarize`;
console.log(`Paid API: ${url} (${ctx.chain.name}, model: ${chooseLlm()})`);

if (!serve) {
  let failures = 0;
  const check = (what: string, ok: boolean, got: unknown = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ` (got ${JSON.stringify(got)})`}`);
  };
  const buyer = privateKeyToAccount(generatePrivateKey());
  const bal = () => ctx.pub.readContract({ address: dep.token, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] });
  const hash = await ctx.wallet("BUYER").writeContract({ address: dep.token, abi: erc20Abi, functionName: "transfer", args: [buyer.address, ctx.u(0.25)], type: "legacy" });
  await ctx.pub.waitForTransactionReceipt({ hash });
  const text = "The ferry timetable changes on Monday. The 07:10 sailing moves to 07:25, the last boat back is now 22:40, and bikes must be booked a day ahead on weekends.";
  const init = (t: string): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
  const opts = { pub: ctx.pub, account: buyer, maxPrice: ctx.u(0.1), payTo: dep.drawers.A! };
  const pay = (p: unknown, t = text) => fetch(url, { ...init(t), headers: { "content-type": "application/json", "x-payment": btoa(JSON.stringify(p)) } });
  const terms = async (t = text) => ((await (await fetch(url, init(t))).json()) as { accepts: PaymentTerms[] }).accepts[0];

  check("no payment -> 402 with terms", (await fetch(url, init(text))).status === 402);
  const before = await bal();
  const res = await paidFetch(url, init(text), opts);
  const body = (await res.json()) as { summary?: string; paidTx?: string };
  check("paid request -> 200 with a summary", res.status === 200 && Boolean(body.summary), body);
  console.log(`     "${body.summary?.replace(/\s+/g, " ").slice(0, 220)}"`);
  check("it cost exactly the price", before - (await bal()) === ctx.u(0.1));
  check("the buyer had no gas at all", (await ctx.pub.getBalance({ address: buyer.address })) === 0n);

  const t1 = await terms();
  const p1 = await signPayment(ctx.pub, buyer, t1);
  check("a bill can't be used for another document", (await pay(p1, text + " Extra.")).status === 400);
  check("a changed signature is refused, nothing taken", (await pay({ ...p1, signature: p1.signature.slice(0, -4) + "1b1b" })).status >= 400);
  const mid = await bal();
  const ok = await pay(p1);
  check("the untouched payment still works", ok.status === 200, ok.status);
  check("replaying it is refused", (await pay(p1)).status === 409);
  check("only one payment was taken", mid - (await bal()) === ctx.u(0.1));
  const poor = await pay(await signPayment(ctx.pub, buyer, await terms()));
  check("not enough money -> refused, nothing taken", poor.status === 402, poor.status);
  check("made-up bill -> new terms", (await pay({ ...p1, billRef: `0x${"11".repeat(32)}` })).status === 402);
  check("garbage header -> 400", (await fetch(url, { ...init(text), headers: { "x-payment": "nope" } })).status === 400);
  check("too much text -> 400", (await fetch(url, init("x".repeat(9_000)))).status === 400);
  check("client refuses a price over its limit", await paidFetch(url, init(text), { ...opts, maxPrice: 1n }).then(() => false, () => true));
  check("client refuses an unexpected drawer", await paidFetch(url, init(text), { ...opts, payTo: dep.drawers.B! }).then(() => false, () => true));
  if (ctx.local) {
    // a refused purchase refunds the buyer: pause the drawer's supplier by removing it
    const { sendDrawer } = await import("@kibble/sdk");
    await sendDrawer(ctx.pub, ctx.wallet("OWNER"), dep.drawers.A!, "removeSupplier", [ctx.address("SUPPLIER")]);
    await sendDrawer(ctx.pub, ctx.wallet("OWNER"), dep.drawers.A!, "tighten", [5, 0n]); // no stranger budget
    const h = await ctx.wallet("BUYER").writeContract({ address: dep.token, abi: erc20Abi, functionName: "transfer", args: [buyer.address, ctx.u(0.1)], type: "legacy" });
    await ctx.pub.waitForTransactionReceipt({ hash: h });
    const b0 = await bal();
    const r = await paidFetch(url, init(text), opts);
    const j = (await r.json()) as { refunded?: boolean };
    check("drawer refuses the input -> buyer refunded in full", r.status === 503 && j.refunded === true && (await bal()) === b0, { status: r.status, j });
  }
  const v = await readDrawer(ctx.pub, dep.drawers.A!);
  const s = await buyerStats(ctx.pub, dep.drawers.A!);
  console.log(`\nDrawer A: ${v.state}. Last ${s.sales} sales: ${s.buyers} buyer(s), top buyer ${(s.topShare * 100).toFixed(1)}%, insiders ${(s.insiderShare * 100).toFixed(1)}%, refunded ${s.refunded}`);
  console.log(failures ? `${failures} FAILED` : "all passed");
  server.close();
  server.closeAllConnections();
  process.exitCode = failures ? 1 : 0;
}
