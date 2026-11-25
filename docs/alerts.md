# Alerts

The contract brakes an agent on its own. Alerts cover the rest: the slow, quiet attacks that [a pause doesn't catch](attacks.md).

```bash
pnpm --filter @kibble/agents alerts                  # the demo drawers
pnpm --filter @kibble/agents alerts 0xYourDrawer     # yours
```

Without a bot, alerts print to the console. For Telegram, create a bot with [@BotFather](https://t.me/BotFather), message it once, find your chat ID, and set these in your environment (never in the repo):

```
TELEGRAM_BOT_TOKEN=…
TELEGRAM_CHAT_ID=…
```

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
