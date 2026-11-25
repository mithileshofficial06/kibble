"use client";

import type { StoryState } from "@kibble/sdk";
import { StatePill } from "@/components/ui";
import type { Focus } from "@/components/story/plan";

const f3 = (x: number | undefined) => (x === undefined ? "…" : x.toFixed(3));

/** The two score cards over the 3D scene. */
export function SideCards({ focus, s }: { focus: Focus; s: StoryState }) {
  return (
    <div className="t3-cards">
      {(["fixed", "kibble"] as const).map((k) => {
        const t = s[k];
        const lost = t.snap && t.first ? Math.max(0, t.snap.spent - t.snap.earned - (t.first.spent - t.first.earned)) : 0;
        const stats =
          focus === "sales"
            ? [
                ["Served", String(t.served), ""],
                ["Turned away", String(t.turnedAway), t.turnedAway ? "coral" : ""],
                ["Limit", f3(t.snap?.limit), k === "kibble" ? "saffron" : ""],
              ]
            : focus === "loss"
              ? [
                  ["Lost so far", f3(lost), lost > 0.0005 ? "coral" : ""],
                  ["Refused", String(t.refused), ""],
                  ["Limit", f3(t.snap?.limit), ""],
                ]
              : [
                  ["Thief spent", f3(t.stolen), t.stolen > 0 ? "coral" : "mint"],
                  ["Blocked", String(t.blocked), ""],
                  ["Could still take", f3(t.snap?.exposure), t.snap?.exposure === 0 ? "mint" : ""],
                ];
        return (
          <div key={k} className={`t3-card ${k} ${t.snap?.state === "Paused" ? "stopped" : ""}`}>
            <div className="t3-card-top">
              <span>{k === "kibble" ? "Kibble" : "Fixed limit"}</span>
              <StatePill state={t.snap?.state} />
            </div>
            <dl>
              {stats.map(([label, v, tone]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={tone}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
