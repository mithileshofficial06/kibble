// Turns a scenario into story events (packages/kibble/src/story.ts) while it runs.
import { erc20Abi, type Address } from "viem";
import { readDrawer, snapOf, type PayResult, type Snap, type StoryActor, type StoryEvent, type StorySide } from "@kibble/sdk";
import type { Ctx } from "./chain";
import type { Deployment } from "./deployments";

export class StoryTeller {
  actor: StoryActor = "agent";
  private rounds = 0;
  private readonly t0 = Date.now();

  constructor(
    private readonly ctx: Ctx,
    private readonly dep: Deployment,
    private readonly emit: (e: StoryEvent) => void,
  ) {}

  private at() {
    return Date.now() - this.t0;
  }

  side(drawer: Address): StorySide {
    const same = (x?: Address) => x?.toLowerCase() === drawer.toLowerCase();
    return same(this.dep.drawers.A_FIXED) || same(this.dep.drawers.B_FIXED) ? "fixed" : "kibble";
  }

  async snap(drawer: Address): Promise<Snap> {
    const [v, vault] = await Promise.all([
      readDrawer(this.ctx.pub, drawer),
      this.ctx.pub.readContract({ address: this.dep.token, abi: erc20Abi, functionName: "balanceOf", args: [this.dep.vault!] }),
    ]);
    return snapOf(v, vault);
  }

  scene(title: string, text: string) {
    this.emit({ kind: "scene", at: this.at(), title, text });
  }

  async sale(drawer: Address, step: "sale" | "earned" | "refund" | "closed", amount: bigint) {
    const snap = step === "sale" ? undefined : await this.snap(drawer);
    this.emit({ kind: "flow", at: this.at(), side: this.side(drawer), step, by: "agent", amount: Number(amount) / 1e6, ...(snap && { snap }) });
  }

  async pay(drawer: Address, r: PayResult, amount: bigint, payee: Address) {
    const to = payee.toLowerCase() === this.ctx.address("SUPPLIER").toLowerCase() ? ("supplier" as const) : ("stranger" as const);
    // a snapshot only where it changes the picture, so live runs stay quick
    const snap = r.status === "refused" || this.actor !== "agent" ? await this.snap(drawer) : undefined;
    this.emit({
      kind: "flow",
      at: this.at(),
      side: this.side(drawer),
      step: r.status === "paid" ? "buy" : "refused",
      by: this.actor,
      amount: Number(amount) / 1e6,
      to,
      ...(r.status === "refused" && { why: r.reason }),
      ...(r.txHash !== "0x" && { tx: r.txHash }),
      ...(snap && { snap }),
    });
  }

  async start(fixed: Address, kibble: Address) {
    const [f, k] = await Promise.all([this.snap(fixed), this.snap(kibble)]);
    this.emit({ kind: "start", at: this.at(), fixed: f, kibble: k });
  }

  async round(fixed: Address, kibble: Address) {
    const [f, k] = await Promise.all([this.snap(fixed), this.snap(kibble)]);
    this.emit({ kind: "round", at: this.at(), n: ++this.rounds, fixed: f, kibble: k });
  }

  async end(fixed: Address, kibble: Address) {
    const [f, k] = await Promise.all([this.snap(fixed), this.snap(kibble)]);
    this.emit({ kind: "end", at: this.at(), fixed: f, kibble: k });
  }
}

/** The drawers a story compares. */
export const STORY_PAIR = {
  "sales-rush": ["A_FIXED", "A"],
  "bad-strategy": ["B_FIXED", "B"],
  hijack: ["A_FIXED", "A"],
} as const;
