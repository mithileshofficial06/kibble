// Recorded runs for the instant replays and the tour. Made by `pnpm --filter @kibble/agents record-story`.
import type { Story } from "@kibble/sdk";
import bad from "./bad-strategy.json";
import hijack from "./hijack.json";
import sales from "./sales-rush.json";

export const STORIES = {
  "sales-rush": sales as unknown as Story,
  "bad-strategy": bad as unknown as Story,
  hijack: hijack as unknown as Story,
};
