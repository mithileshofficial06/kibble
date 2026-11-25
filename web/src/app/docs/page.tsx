import type { Metadata } from "next";
import { links, TUSD8_ADDRESS } from "@aevum-kit/aevum";
import { DocsToc } from "@/components/DocsToc";
import { GitHubIcon } from "@/components/Icons";
import { PageHead, Reveal, StatePill } from "@/components/ui";
import { repoUrl } from "@/lib/env";
import aevum from "../../../../deployments/44005.json";

export const metadata: Metadata = { title: "How it works" };

const sections = [
  { id: "problem", label: "The problem" },
  { id: "how", label: "How Kibble works" },
  { id: "hijack", label: "What a hijacker can take" },
  { id: "screens", label: "Using this app" },
  { id: "contracts", label: "Contracts on Aevum" },
  { id: "run", label: "Run it yourself" },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="code" tabIndex={0}>
      <code>{children.trim()}</code>
    </pre>
  );
}

function Addr({ a }: { a: string }) {
  return (
    <a href={`${links.explorer}/address/${a}`} target="_blank" rel="noreferrer">
      <code>{a}</code>
    </a>
  );
}

export default function DocsPage() {
  return (
    <main className="shell">
      <PageHead
        n="K—05"
        rail="How it works · contracts on Aevum"
        eyebrow="How it works"
        title="An *earned* spending limit for AI agents."
        lede="A fixed limit is a guess. Kibble's limit is earned from verified value, and the wallet itself brakes the agent when spending stops paying for itself."
        aside={
          <a className="btn secondary" href={repoUrl} target="_blank" rel="noreferrer">
            <GitHubIcon size={16} />
            View the code on GitHub
          </a>
        }
      />

      <div className="docs">
        <DocsToc sections={sections} />

        <article className="docs-body">
          <Reveal as="section" id="problem" y={20}>
            <h2>
              <span className="n">01</span>
              The problem
            </h2>
            <p>Agents pay for model calls, data and other agents&apos; services on their own. A fixed limit fails three ways:</p>
            <table className="docs-table" tabIndex={0}>
              <tbody>
                <tr>
                  <th>Losing agent</th>
                  <td>Keeps spending up to the limit every day until a human reads the alert.</td>
                </tr>
                <tr>
                  <th>Winning agent</th>
                  <td>Hits the cap and turns customers away until someone raises it by hand.</td>
                </tr>
                <tr>
                  <th>Hijacked agent</th>
                  <td>The attacker spends the full limit, every day, until a human reacts.</td>
                </tr>
              </tbody>
            </table>
          </Reveal>

          <Reveal as="section" id="how" y={20}>
            <h2>
              <span className="n">02</span>
              How Kibble works
            </h2>
            <ol className="how">
              <li>
                <strong>The drawer</strong> (one contract per agent; the app calls it a cash box) holds the agent&apos;s money. The agent&apos;s key holds nothing: it can
                only ask the drawer to pay.
              </li>
              <li>
                <strong>A small float.</strong> The agent spends from an allowance capped at <strong>T</strong>.
              </li>
              <li>
                <strong>Verified value refills it:</strong> sales income once it clears (after a hold, or when the buyer acknowledges
                delivery), or work a client signs as accepted.
              </li>
              <li>
                <strong>Profit goes to the vault</strong>, which the agent key can never reach.
              </li>
              <li>
                <strong>The limit is earned:</strong> profitable windows grow T; losses shrink it.
              </li>
              <li>
                <strong>Cost ceiling:</strong> spend in a window can&apos;t exceed the value earned times the agent&apos;s learned cost share
                (plus 10 points). Going over is refused and counts as a strike.
              </li>
              <li>
                <strong>The wallet brakes the agent:</strong> 1 strike → Watch, 2 → Braked, 3 (or the weekly loss limit) → Paused. Two clean
                windows bring it back.
              </li>
              <li>
                <strong>One owner setting</strong>, the max weekly loss, sets everything else.
              </li>
              <li>
                <strong>Tighten fast, loosen slow:</strong> lowering anything is instant; raising waits, and the guardian can cancel it.
                Owner and guardian together can resume at once.
              </li>
            </ol>
            <div className="ladder" aria-label="The brake ladder">
              <div>
                <StatePill state="Healthy" />
                <small>spending pays for itself</small>
              </div>
              <div>
                <StatePill state="Watch" />
                <small>1 strike</small>
              </div>
              <div>
                <StatePill state="Braked" />
                <small>2 strikes: limit cut</small>
              </div>
              <div>
                <StatePill state="Paused" />
                <small>3 strikes or the weekly loss: exposure 0</small>
              </div>
            </div>
          </Reveal>

          <Reveal as="section" id="hijack" y={20}>
            <h2>
              <span className="n">03</span>
              What a hijacker can take
            </h2>
            <table className="docs-table" tabIndex={0}>
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">What happens</span>
                  </th>
                  <th>Fixed limit, with alerts</th>
                  <th>Kibble</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Pay a stranger</td>
                  <td>Nothing (allowlist)</td>
                  <td>At most a small lifetime budget</td>
                </tr>
                <tr>
                  <td>Overspend with approved suppliers</td>
                  <td>The full limit, refilled every window</td>
                  <td>Refused at the cost ceiling; paused after 3 strikes</td>
                </tr>
                <tr>
                  <td>Reach the savings</td>
                  <td>Everything sits where the limit refills from</td>
                  <td>Profit is already in the vault</td>
                </tr>
              </tbody>
            </table>
            <p>
              Every drawer shows its exact exposure live as <strong>maxLossNow</strong> = allowance + active runway, and 0 once paused.
            </p>
          </Reveal>

          <Reveal as="section" id="screens" y={20}>
            <h2>
              <span className="n">04</span>
              Using this app
            </h2>
            <dl className="screens">
              <dt>Live desk</dt>
              <dd>Fixed-limit agents on the left, Kibble agents on the right, with the scoreboard, live state and the window-by-window time-lapse.</dd>
              <dt>Drawer pages</dt>
              <dd>
                Every number, receipt, closed window and refusal of one drawer: its public track record. Connect the owner&apos;s or
                guardian&apos;s wallet to freeze, tighten, queue a raise, fund it, grant a runway, or co-sign an instant resume.
              </dd>
              <dt>Playground</dt>
              <dd>Three buttons that run a short demo on Aevum testnet without a wallet: a sales rush, a bad strategy and a hijack.</dd>
            </dl>
          </Reveal>

          <Reveal as="section" id="contracts" y={20}>
            <h2>
              <span className="n">05</span>
              Contracts on Aevum testnet (chain 44005)
            </h2>
            <table className="docs-table" tabIndex={0}>
              <tbody>
                <tr>
                  <th>KibbleFactory</th>
                  <td>
                    <Addr a={aevum.factory} />
                  </td>
                </tr>
                <tr>
                  <th>KibbleDrawer (clone implementation)</th>
                  <td>
                    <Addr a={aevum.drawerImpl} />
                  </td>
                </tr>
                <tr>
                  <th>KibbleAdmin (owner functions)</th>
                  <td>
                    <Addr a={aevum.adminModule} />
                  </td>
                </tr>
                <tr>
                  <th>Demo owner vault</th>
                  <td>
                    <Addr a={aevum.vault} />
                  </td>
                </tr>
                <tr>
                  <th>tUSD8</th>
                  <td>
                    <Addr a={TUSD8_ADDRESS} />
                  </td>
                </tr>
              </tbody>
            </table>
          </Reveal>

          <Reveal as="section" id="run" y={20}>
            <h2>
              <span className="n">06</span>
              Run it yourself
            </h2>
            <Code>{`
git clone ${repoUrl}
cd kibble && pnpm install && make build
make fork                                   # local copy of Aevum on :8555
pnpm --filter @kibble/agents setup-demo
pnpm --filter @kibble/agents scenario all
pnpm --filter web dev                       # this app on :3000`}</Code>
            <p>
              The README has the full guide, the contract API, the platform findings and the known limits. Network details:{" "}
              <a href={links.explorer} target="_blank" rel="noreferrer">
                {links.explorer.replace("https://", "")}
              </a>
              .
            </p>
          </Reveal>

          <p className="fine">
            Source: <a href={repoUrl} target="_blank" rel="noreferrer">{repoUrl.replace("https://", "")}</a>. MIT licensed. Based on the Aevum
            Starter Kit (MIT, PQA Labs).
          </p>
        </article>
      </div>
    </main>
  );
}
