"use client";

import Link from "next/link";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { createDrawer, fundDrawer, units, vaultOf, type Timing, type Wallet } from "@kibble/sdk";
import { PageHead, Reveal, SecHead } from "@/components/ui";
import { repoUrl } from "@/lib/env";
import { explain } from "@/lib/errors";
import { amt, short, useDeployment, usePub } from "@/lib/kibble";
import { useNetwork } from "@/lib/network";

const MONEY = /^\d{1,6}(\.\d{1,6})?$/;

const CLI = `git clone --recursive ${repoUrl}
cd kibble && pnpm install
pnpm kibble new --name "My agent" --loss 2
pnpm kibble try`;

const CODE = `import { KibbleAgent } from "@kibble/sdk";

const kibble = new KibbleAgent(pub, agentWallet, drawer);
const r = await kibble.pay(supplier, "0.004", "invoice-17");
if (r.status === "refused") console.log(r.text); // plain words, not an exception`;

/** Create a drawer for your own agent, from the browser or the command line. */
export default function ConnectPage() {
  const { address, isConnected, chainId } = useAccount();
  const { net } = useNetwork();
  const { data: wallet } = useWalletClient({ chainId: net.chain.id });
  const pub = usePub();
  const dep = useDeployment();
  const [label, setLabel] = useState("My agent");
  const [loss, setLoss] = useState("2");
  const [agent, setAgent] = useState("");
  const [guardian, setGuardian] = useState("");
  const [supplier, setSupplier] = useState("");
  const [cap, setCap] = useState("0.05");
  const [timing, setTiming] = useState<Timing>("fast");
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Address | null>(null);

  const supplierAddr = supplier || dep.data?.roles.SUPPLIER || "";
  const same = (a: string, b?: string) => Boolean(b) && a.toLowerCase() === b!.toLowerCase();
  const problem = !isConnected
    ? "Connect the wallet that will own the agent."
    : chainId !== net.chain.id
      ? `Switch your wallet to ${net.chain.name}.`
      : !label.trim()
        ? "Give the agent a name."
        : !MONEY.test(loss) || Number(loss) <= 0
          ? "The weekly loss must be an amount like 2."
          : !isAddress(agent)
            ? "Enter the address your agent signs with."
            : !isAddress(guardian)
              ? "Enter a guardian address."
              : same(agent, address) || same(agent, guardian)
                ? "The agent key must not be the owner or the guardian."
                : !isAddress(supplierAddr)
                  ? "Enter a supplier address."
                  : !MONEY.test(cap) || Number(cap) <= 0
                    ? "The payment cap must be an amount like 0.05."
                    : null;

  async function go() {
    if (!wallet || !pub || !dep.data || problem) return;
    setBusy(true);
    setError(null);
    setSteps([]);
    const say = (s: string) => setSteps((x) => [...x, s]);
    try {
      const owner = wallet as Wallet;
      const factory = dep.data.factory;
      const vault = await vaultOf(pub, factory, owner.account.address);
      say(vault ? `Using your vault ${short(vault)}. Confirm the drawer in your wallet.` : "Confirm two transactions: your vault, then the drawer.");
      const d = await createDrawer(pub, owner, factory, {
        label: label.trim().slice(0, 60),
        agent: agent as Address,
        guardian: guardian as Address,
        maxWeeklyLoss: units(loss),
        suppliers: [{ payee: supplierAddr as Address, perPayment: units(cap), perWindow: 0n }],
        timing,
      });
      setDrawer(d);
      say(`Drawer created: ${short(d)}. Confirm the first allowance (${amt(units(loss) / 10n)} tUSD8, two transactions).`);
      await fundDrawer(pub, owner, d, units(loss) / 10n);
      say("Funded. Your agent can ask it to pay.");
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <PageHead
        n="K—05"
        rail="Connect your agent"
        eyebrow="Five minutes, test money"
        title="Give your agent a *drawer.*"
        lede="Set one number: the most you're willing to lose in a week. Your agent gets a key that can only ask. The drawer decides."
      />

      <section className="stack">
        <SecHead n="01" title="From your *browser.*" note="Your wallet becomes the owner. Nothing here sees a private key." />
        <div className="grid-2">
          <Reveal className="card">
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void go();
              }}
            >
              <label>
                <span>Name</span>
                <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
              </label>
              <label>
                <span>Most you&apos;ll lose in a week (tUSD8)</span>
                <input inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value.trim())} />
              </label>
              <label>
                <span>Agent address</span>
                <input className="mono" placeholder="0x… (a fresh key only your agent holds)" value={agent} onChange={(e) => setAgent(e.target.value.trim())} />
              </label>
              <label>
                <span>Guardian address</span>
                <input className="mono" placeholder="0x… (a second wallet you control)" value={guardian} onChange={(e) => setGuardian(e.target.value.trim())} />
              </label>
              <label>
                <span>Supplier it may pay</span>
                <input className="mono" placeholder={dep.data?.roles.SUPPLIER ?? "0x…"} value={supplier} onChange={(e) => setSupplier(e.target.value.trim())} />
              </label>
              <label>
                <span>Cap per payment (tUSD8)</span>
                <input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value.trim())} />
              </label>
              <label>
                <span>Windows</span>
                <select value={timing} onChange={(e) => setTiming(e.target.value as Timing)}>
                  <option value="fast">2 minutes (trying it out)</option>
                  <option value="daily">1 day (production defaults)</option>
                </select>
              </label>
              <div className="row">
                <button className="btn" type="submit" disabled={Boolean(problem) || busy || !wallet}>
                  {busy ? "Working…" : "Create the drawer"}
                </button>
                <span className="fine">{problem ?? "Ready."}</span>
              </div>
            </form>
          </Reveal>
          <Reveal className="card" delay={0.1}>
            <h2>What you get</h2>
            <dl className="kv">
              <dt>Starting limit T</dt>
              <dd>{MONEY.test(loss) ? `${amt(units(loss) / 10n)} tUSD8` : "…"}</dd>
              <dt>T can grow to</dt>
              <dd>{MONEY.test(loss) ? `${amt(units(loss) / 2n)} tUSD8` : "…"}</dd>
              <dt>Payments above this need your signature</dt>
              <dd>{MONEY.test(loss) ? `${amt(units(loss) / 10n)} tUSD8` : "…"}</dd>
              <dt>You need</dt>
              <dd>{MONEY.test(loss) ? `${amt(units(loss) / 10n)} tUSD8 and a little tQDAY` : "…"}</dd>
            </dl>
            <div aria-live="polite">
              {steps.length > 0 && (
                <ul>
                  {steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
              {error && <p className="fine bad-text" role="alert">{error}</p>}
              {drawer && (
                <p className="fine">
                  <Link href={`/drawer/${drawer}`}>Open your drawer</Link>: receipts, track record and your controls.
                </p>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="stack">
        <SecHead n="02" title="From the *command line.*" note="Makes test keys in your home folder, then the vault, drawer and first allowance." />
        <div className="grid-2">
          <Reveal className="card">
            <h2>Four lines</h2>
            <pre>{CLI}</pre>
            <p className="fine">
              The first run prints an address to fund from the faucet. <code>try</code> runs one sale, one purchase and one refused payment.
            </p>
          </Reveal>
          <Reveal className="card" delay={0.1}>
            <h2>In your agent</h2>
            <pre>{CODE}</pre>
            <p className="fine">
              <a href={`${repoUrl}/blob/main/docs/connect-your-agent.md`} target="_blank" rel="noreferrer">
                The full guide
              </a>{" "}
              covers selling, refunds, and giving an AI model the pay tool safely. See <Link href="/agents">every agent on Kibble</Link>.
            </p>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
