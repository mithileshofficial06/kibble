# Alerts

The contract brakes an agent on its own. Alerts cover the rest: the slow, quiet attacks that [a pause doesn't catch](attacks.md).

```bash
pnpm --filter @kibble/agents alerts                  # the demo drawers
pnpm --filter @kibble/agents alerts 0xYourDrawer     # yours
```

Without a webhook, alerts print to the console. For Discord, open a channel in your own server, then **Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL**, and set it in your environment (never in the repo: anyone with the link can post):

```
DISCORD_WEBHOOK_URL=…
```

Then check it with `pnpm --filter @kibble/agents alerts test`, which sends one test message.

| You get | When |
|---|---|
| 🛑 now Paused or Revoked | The state changed, with the reason |
| 🛑 tokens left without a payment | `UnexplainedOutflow` |
| ⚠️ now Watch or Braked | The state changed, with the reason |
| ⚠️ payments refused | Grouped by reason, with a count and a total |
| ⚠️ lost money in a window | A fixed-limit drawer raised `Alert` |
| ⚠️ spent with no sales | A window closed with spending and no value (a slow drip) |
| ⚠️ spending above its normal share | More than 3 points over the learned cost share (a skim) |
| ⚠️ refunded several customers | Three or more since the last look |
| ⚠️ unconfirmed orders piling up | Pending sales above three times the limit (orders taken, not delivered) |

The watcher only reads the chain. It holds no key and can't act: to stop an agent, use **Freeze** in the app or `pnpm kibble freeze`.
