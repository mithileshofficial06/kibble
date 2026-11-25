# Connect your agent

Give an AI agent a key that can only *ask* to pay. A contract (its **drawer**) holds the money and decides. You set one number: the most you're willing to lose in a week.

Testnet only, not audited. Use fresh test keys.

## 1. Create a drawer (5 minutes)

You need [Node 22+](https://nodejs.org), [pnpm](https://pnpm.io) and a little test money from the [Aevum faucet](starter-kit.md#get-test-tokens).

```bash
git clone --recursive https://github.com/mithileshofficial06/kibble
cd kibble && pnpm install
pnpm kibble new --name "My agent" --loss 2
```

The first run makes three test keys in `~/.kibble/agent.env` (owner, guardian, agent) and prints an address to fund: about **0.05 tQDAY** and **0.2 tUSD8**. Fund it, run the same command again, and you have a vault, a drawer and a first allowance.

```bash
pnpm kibble try      # one sale, one purchase, one refused payment
pnpm kibble status
pnpm kibble freeze   # stop the agent now
pnpm kibble resume   # owner and guardian co-sign
```

| Option | Meaning |
|---|---|
| `--loss 2` | The most you'll lose in a week, in tUSD8. The starting limit is a tenth of it |
| `--supplier 0x…` | An address the agent may pay. Default: the demo supplier |
| `--cap 0.05` | The most per payment to that supplier |
| `--daily` | Production timings (1-day windows). Default: 2-minute windows, for trying it out |

Prefer a browser? Use the **Connect** page of the web app with your own wallet.

## 2. Spend from your code

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { aevumTestnet } from "@aevum-kit/aevum";
import { KibbleAgent } from "@kibble/sdk";

const pub = createPublicClient({ chain: aevumTestnet, transport: http() });
const wallet = createWalletClient({ account: privateKeyToAccount(process.env.AGENT_KEY as `0x${string}`), chain: aevumTestnet, transport: http() });
const kibble = new KibbleAgent(pub, wallet, process.env.DRAWER as `0x${string}`);

const r = await kibble.pay("0xSupplier…", "0.004", "invoice-17");
if (r.status === "refused") console.log(r.text);
```

- **A refusal is an answer, not an exception.** `r.text` says why in plain words.
- **Pay once.** The same payee, amount and bill is never paid twice, so retrying after a timeout is safe.

## 3. Earn

Your customers pay the drawer, and that's what raises the limit.

| Step | Who | Call |
|---|---|---|
| Pay for an order | customer | `approve`, then `drawer.buy(billRef, amount)` (or a gasless `buyWithAuthorization`) |
| Buy what you need | your agent | `kibble.pay(...)` |
| Confirm delivery | customer | `drawer.ackDelivery(billRef)`: the sale counts at once. Otherwise it counts after the hold |
| Can't deliver | your agent | `kibble.refund(billRef)`, before the sale clears |

One sale backs its spending once, so the agent key can't refund a sale it has already spent against. The owner can.

## 4. Give a model the pay tool

Expose one tool, `pay(payee, amount, reason)`, and treat what the model sends as untrusted input: check that the payee is an address and the amount is a plain decimal, then call `kibble.pay`. [`agents/src/ai-agent.ts`](../agents/src/ai-agent.ts) is a complete example. You don't need to write "stay within budget" in the prompt: the drawer enforces it.

## 5. Tell us how it went

Every drawer is listed on the app's **Agents** page. If you ran one, please open an issue with the [outside agent report](https://github.com/mithileshofficial06/kibble/issues/new?template=outside-agent.yml). Bad news is as useful as good news.
