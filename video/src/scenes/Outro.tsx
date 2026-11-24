import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GrainField } from "../components/Grains";
import { Appear, Card, Label, Odometer, Pill, Rise } from "../components/ui";
import { C, MONO, SANS } from "../theme";
import { EASE, EASE_IO, FPS, prog, scene, wf } from "../tl";
import { wordmarkGrains } from "./Problem";

const TESTS = [
  "invariant_bucketsMatchBalance", "invariant_allowanceWithinT", "invariant_maxLossNowBounded", "invariant_strangersWithinU",
  "invariant_fingerprintPaidOnce", "invariant_payNeverReverts", "invariant_supplierWindowCap", "invariant_workCreditsWithinBudget",
  "invariant_spendCoveredByValueAndFunding", "test_hijack_fixedVsEarned", "test_fork_hijackPausesWithRealToken", "test_ceiling_refusesAndStrikesWalkTheLadder",
  "test_T_growsOnProfit_cappedByStep", "test_T_shrinksOnLoss_andLossMovesToWatch", "test_drawdown_brakesAtHalfL_pausesAtL", "test_agentCannotTouchVault",
  "test_resumeNow_needsOwnerAndGuardian", "test_buyWithAuthorization_boundToBill", "test_fork_gaslessBuy_eip3009_realTusd8", "testFuzz_ceilingNeverExceeded",
  "testFuzz_TGrowthBounded", "test_learning_calibratesCostBps", "test_income_clearingCappedPerBlock_excessToVault", "test_unexplainedOutflow_pauses",
  "test_pay_stranger_capsAtOneTusd8Lifetime", "test_runway_investmentIsNotALoss", "test_refund_fromPendingIncome_doesNotUseU", "test_approval_noReplay",
];

/* ================================================================== proof */
export const Proof: React.FC = () => {
  const f = useCurrentFrame();
  const S = "proof";
  const n97 = wf(S, "ninety-seven"), n10 = wf(S, "ten"), n128 = wf(S, "hundred"), worst = wf(S, "worst"), read = wf(S, "read");
  const stats = 1 - prog(f, worst - 16, worst + 10, EASE_IO);
  const roll = (at: number, v: number) => interpolate(f, [at - 4, at + 50], [0, v], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const formula = prog(f, worst, worst + 30, EASE_IO);
  const rows = [
    { name: "Kibble A", v: "0.000", s: "Paused" as const },
    { name: "Kibble B", v: "0.000", s: "Paused" as const },
    { name: "Kibble W", v: "0.014", s: "Watch" as const },
    { name: "Fixed A′", v: "0.376", s: "Healthy" as const },
    { name: "Fixed B′", v: "0.047", s: "Healthy" as const },
  ];
  return (
    <AbsoluteFill>
      {/* test runner log */}
      <div style={{ position: "absolute", right: 120, top: 150, width: 640, height: 720, overflow: "hidden", opacity: 0.85 * stats, maskImage: "linear-gradient(180deg, transparent, #000 18%, #000 80%, transparent)" }}>
        <div style={{ transform: `translateY(${-f * 1.6}px)` }}>
          {[...TESTS, ...TESTS, ...TESTS].map((t, i) => (
            <div key={i} style={{ fontFamily: MONO, fontSize: 17, lineHeight: "34px", color: i % 7 === 0 ? C.fg2 : C.faint, whiteSpace: "nowrap" }}>
              <span style={{ color: C.mint }}>[PASS]</span> {t}
              {t.startsWith("invariant") && <span style={{ color: C.muted }}> (runs: 256, calls: 128000)</span>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: 140, top: 150, opacity: stats }}>
        {[
          { v: roll(n97, 97), label: "Foundry tests", sub: "unit · fuzz · attack · fork", at: n97 },
          { v: roll(n10, 10), label: "Invariants", sub: "never broken", at: n10 },
          { v: roll(n128, 128000), label: "Random calls", sub: "against the invariants", at: n128 },
        ].map((s, i) => {
          const p = prog(f, s.at - 10, s.at + 16);
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: 28, marginBottom: 34, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
              <Odometer value={s.v} size={i === 2 ? 168 : 168} weight={100} color={i === 2 ? C.saffron : C.fg} comma={i === 2} />
              <div style={{ paddingBottom: 22 }}>
                <div style={{ fontFamily: SANS, fontSize: 32, fontWeight: 300, color: C.fg }}>{s.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 14, color: C.muted, letterSpacing: "0.12em", marginTop: 6 }}>{s.sub.toUpperCase()}</div>
              </div>
            </div>
          );
        })}
      </div>
      {/* the bound */}
      <div style={{ position: "absolute", left: 140, top: 170, opacity: formula, transform: `translateY(${(1 - formula) * 30}px)` }}>
        <Label size={15} color={C.saffron} dot={C.saffron}>The worst case, exactly</Label>
        <div style={{ fontFamily: MONO, fontSize: 64, color: C.fg, marginTop: 26, letterSpacing: "-0.02em" }}>
          maxLossNow() <span style={{ color: C.muted }}>=</span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 72, fontWeight: 300, color: C.fg, marginTop: 6, letterSpacing: "-0.03em" }}>
          allowance <span style={{ color: C.saffron }}>(≤ T)</span> + runway
        </div>
        <div style={{ fontFamily: SANS, fontSize: 28, color: C.fg2, marginTop: 20, fontWeight: 300 }}>and zero once the agent is paused. The vault is never in it.</div>
      </div>
      <div style={{ position: "absolute", left: 1120, top: 470, width: 660, opacity: prog(f, read - 20, read + 10) }}>
        <Card>
          <Label size={12} color={C.muted}>Read on chain · now</Label>
          {rows.map((r, i) => (
            <div key={r.name} style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: i < rows.length - 1 ? `1px solid ${C.line}` : "none", opacity: prog(f, read + i * 5, read + i * 5 + 14) }}>
              <span style={{ flex: 1, fontFamily: SANS, fontSize: 24, color: C.fg, fontWeight: 300 }}>{r.name}</span>
              <span style={{ width: 150 }}><Pill state={r.s} size={11} /></span>
              <span style={{ fontFamily: MONO, fontSize: 26, color: r.v === "0.000" ? C.mint : C.fg, width: 110, textAlign: "right" }}>{r.v}</span>
            </div>
          ))}
        </Card>
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================== close */
export const Close: React.FC = () => {
  const f = useCurrentFrame();
  const S = "close";
  const sc = scene(S);
  const guess = wf(S, "a"), earned = wf(S, "kibbles"), dont = wf(S, "dont");
  const lines = 1 - prog(f, dont - 26, dont - 4, EASE_IO);
  const grains = useMemo(() => wordmarkGrains(23, 0.45, 6), []);
  const gt = (f - (dont - 40)) / FPS;
  const fade = prog(f, sc.frames - 50, sc.frames, EASE_IO);
  return (
    <AbsoluteFill style={{ opacity: 1 - fade }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 330, opacity: lines, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <Rise text="A fixed limit is a *guess.*" at={guess - 4} size={104} align="center" accent={C.muted} />
        <Rise text="Kibble's is *earned.*" at={earned - 6} size={104} align="center" />
      </div>
      {gt > -0.1 && <GrainField grains={grains} t={Math.max(0, gt)} dur={1.15} camZ={interpolate(f, [dont - 40, sc.frames], [10.4, 9.7])} focus={10} />}
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", justifyContent: "center" }}>
        <Rise text="Don't give your agent a budget. Let it *earn* one." at={dont + 8} size={50} align="center" />
      </div>
      <Appear at={dont + 90} style={{ position: "absolute", left: 0, right: 0, top: 800, display: "flex", justifyContent: "center", gap: 46 }}>
        <Label size={15} color={C.fg2}>github.com/mithileshofficial06/kibble</Label>
        <Label size={15} color={C.faint}>·</Label>
        <Label size={15} color={C.fg2} dot={C.mint}>Live on QDay Aevum testnet</Label>
        <Label size={15} color={C.faint}>·</Label>
        <Label size={15} color={C.fg2}>QDay Aevum Builder Challenge #1</Label>
      </Appear>
    </AbsoluteFill>
  );
};
