import { useMemo } from "react";
import {
  Bowl, Chain, Coin, FlyingCoins, GlassBox, Goods, PELLET_GEO, PELLET_MAT, Pedestal, Person, Robot, Safe, Supplier, Thief, Tray, rng,
  type RobotProps, type V3,
} from "./assets";
import { DUEL, ONE, SHOP, add } from "./director";
import { K, LADDER } from "./theme";
import { EASE, at, clamp, end, lerp, p, sec, w } from "./tl";

/** The four sets. Each reads the frame and works out what every object is doing. */

const pop = (f: number, a: number, d = 24) => p(f, a, a + d, EASE.back);
const lc = (a: string, b: string, t: number) => (t < 0.5 ? a : b);
const pulse = (f: number, a: number, d = 30) => (f >= a && f < a + d ? Math.sin(((f - a) / d) * Math.PI) : 0);

// ------------------------------------------------------------ one shop

export type ShopState = {
  kind: "fixed" | "kibble";
  robot?: Partial<RobotProps>;
  coins?: number;
  light?: string;
  locked?: number;
  lockColor?: string;
  trayW?: number;
  trayN?: number;
  trayEdge?: string;
  trayGlow?: number;
  safeS?: number;
  safeGlow?: number;
  bowlFill?: number;
  rim?: string;
  s?: number;
  shake?: number;
  shield?: number;
};
export const Shop = ({ pos, st, f, children }: { pos: V3; st: ShopState; f: number; children?: React.ReactNode }) => {
  const s = st.s ?? 1;
  if (s <= 0.001) return null;
  const shake = (st.shake ?? 0) * Math.sin(f * 2.2) * 0.04;
  return (
    <group position={pos} scale={s}>
      <Pedestal p={[0, 0, 0]} rim={st.rim ?? (st.kind === "kibble" ? K.mint : "#7d88b8")} />
      <Robot p={SHOP.robot} ry={0.45} f={f} badge={st.kind === "kibble" ? K.mint : "#9aa6d6"} {...st.robot} />
      <Supplier p={SHOP.supplier} ry={0.5} />
      {st.kind === "fixed" ? (
        <Bowl p={SHOP.bowl} fill={st.bowlFill ?? 1} />
      ) : (
        <>
          <GlassBox p={[SHOP.box[0] + shake, SHOP.box[1], SHOP.box[2]]} coins={st.coins ?? 20} light={st.light ?? K.mint} locked={st.locked ?? 0} lockColor={st.lockColor ?? K.mint} f={f} />
          {(st.trayW ?? 1.3) > 0.02 && <Tray p={SHOP.tray} w={st.trayW ?? 1.3} n={st.trayN ?? 4} edge={st.trayEdge ?? K.mint} edgeGlow={st.trayGlow ?? 1.6} />}
          {(st.safeS ?? 1) > 0.01 && <Safe p={[SHOP.safe[0], SHOP.safe[1] - (1 - (st.safeS ?? 1)) * 1.4, SHOP.safe[2]]} ry={-0.45} s={Math.max(0.01, st.safeS ?? 1)} glowAmt={st.safeGlow ?? 0.4} f={f} shield={st.shield ?? 0} />}
        </>
      )}
      {children}
    </group>
  );
};

/** Points inside a shop, in its own coordinates. */
const PT = {
  hands: add(SHOP.robot, [0.2, 1.0, 0.55]),
  boxTop: add(SHOP.box, [0, 1.35, 0]),
  boxIn: add(SHOP.box, [0, 0.45, 0]),
  tray: add(SHOP.tray, [0, 0.2, 0]),
  supplier: add(SHOP.supplier, [0.25, 1.1, 0.1]),
  safeTop: add(SHOP.safe, [0, 1.25, 0]),
  bowl: add(SHOP.bowl, [0, 0.5, 0]),
  thief: add(SHOP.thief, [0.3, 1.0, 0.2]),
  counter: add(SHOP.counter, [0, 1.0, 0]),
};
export { PT };

/** Customers walking up to the counter, paying, and leaving. */
const Queue = ({ f, t0, n, gap, seed = 1, turnAway = Infinity, payTo, served = true }: { f: number; t0: number; n: number; gap: number; seed?: number; turnAway?: number; payTo: V3; served?: boolean }) => {
  const r = useMemo(() => {
    const g = rng(seed);
    return Array.from({ length: n }, () => ({ c: Math.floor(g() * 6), dx: (g() - 0.5) * 0.5 }));
  }, [n, seed]);
  const IN = 48, STAY = 34, OUT = 60;
  return (
    <>
      {r.map((x, i) => {
        const a = t0 + i * gap;
        const tl = f - a;
        if (tl < 0 || tl > IN + STAY + OUT) return null;
        const away = a + IN >= turnAway; // arrived after the money ran out
        const from: V3 = [4.6 + x.dx, 0, 5.4];
        const stop: V3 = [SHOP.counter[0] + x.dx * 0.5, 0, SHOP.counter[2] + 0.25];
        const exit: V3 = [-0.6, 0, 6.4];
        let pos: V3, ry: number, walk: number;
        if (tl < IN) {
          const t = EASE.inOut(tl / IN);
          pos = [lerp(from[0], stop[0], t), 0, lerp(from[2], stop[2], t)];
          ry = Math.PI - 0.7;
          walk = 1;
        } else if (tl < IN + STAY) {
          pos = stop;
          ry = Math.PI + 0.55;
          walk = 0;
        } else {
          const t = EASE.inOut((tl - IN - STAY) / OUT);
          pos = [lerp(stop[0], exit[0], t), 0, lerp(stop[2], exit[2], t)];
          ry = -Math.PI / 2 + 0.25;
          walk = 1;
        }
        const fade = Math.min(1, tl / 10, (IN + STAY + OUT - tl) / 14);
        return (
          <group key={i}>
            <Person p={pos} ry={ry + Math.PI} color={x.c} f={f} walk={walk} fade={fade} sad={away ? 1 : 0} />
            {served && !away && <FlyingCoins a={add(stop, [0, 1.0, 0])} b={payTo} t0={a + IN + 4} n={1} gap={0} dur={26} f={f} h={0.6} seed={i + seed} />}
          </group>
        );
      })}
    </>
  );
};

// ------------------------------------------------------------ chapter 1: three agents, one fixed limit

export const SetOne = ({ f }: { f: number }) => {
  // the hook: one robot wakes and starts buying (local layout, robot nearer the middle)
  const robot: V3 = [-0.7, 0, 0.55];
  const supplier: V3 = [2.3, 0, -1.5];
  const bowlP: V3 = [1.05, 0, 0.45];
  const wake = p(f, sec(0.5), sec(1.6));
  const blink = 1 - wake + pulse(f, sec(5.2), 10) + pulse(f, at("limit", 2.2), 10);
  const goods = (["data", "tools", "agent"] as const).map((kind, i) => {
    const t0 = w("hook", ["data", "tools", "help"][i]) - 8;
    const t = p(f, t0, t0 + 34, EASE.inOut);
    const from = add(supplier, [0.2, 1.2, 0]);
    const orbit = (f - t0) / 70 + (i * Math.PI * 2) / 3;
    const home: V3 = add(robot, [Math.cos(orbit) * 0.95, 2.05 + Math.sin(orbit * 1.3) * 0.08, Math.sin(orbit) * 0.6]);
    const mid: V3 = [lerp(from[0], home[0], t), lerp(from[1], home[1], t) + Math.sin(t * Math.PI) * 0.8, lerp(from[2], home[2], t)];
    const gone = 1 - p(f, at("limit", 0.2), at("limit", 0.9), EASE.in);
    return { kind, pos: mid, s: (f < t0 ? 0 : 1) * gone * (0.7 + 0.3 * pop(f, t0)), t0 };
  });
  const reach = Math.max(...goods.map((g) => pulse(f, g.t0 + 6, 40))) * 0.8;
  const bowlDrop = p(f, w("limit", "fixed") - 6, w("limit", "fixed") + 26, EASE.out);
  const bowlY = (1 - bowlDrop) * 5 + Math.sin(Math.min(1, bowlDrop * 1.6) * Math.PI) * 0;
  const showBowl = f >= w("limit", "fixed") - 6;

  // the guess: the two other agents rise
  const sides = pop(f, at("guess", 0.1), 40);
  // left: the good agent runs out and customers leave
  const runsOut = w("guess", "runs") + 30;
  const leftFill = 1 - p(f, w("guess", "great") - 10, runsOut, EASE.inOut);
  // middle: the bad agent wastes the whole limit, every day
  const day = 64;
  const badT = f - w("guess", "bad");
  const midFill = badT < 0 ? 1 : 1 - ((badT % day) / day) * 0.98;
  // right: the thief takes it all
  const thiefIn = p(f, w("guess", "thief") - 6, w("guess", "thief") + 22);
  const rightFill = 1 - p(f, w("guess", "gets") - 8, w("guess", "gets") + 70, EASE.inOut);
  const R = ONE.right, L = ONE.left;
  return (
    <group>
      {/* the hero agent, in the middle */}
      <group position={ONE.mid}>
        <Pedestal p={[0, 0, 0]} rim="#7d88b8" rimGlow={0.4 + wake * 1.2} />
        <Robot p={robot} ry={0.15} f={f} badge="#9aa6d6" blink={clamp(blink)} reach={reach} sad={badT > 0 ? p(f, w("guess", "bad"), w("guess", "bad") + 30) : 0} />
        <Supplier p={supplier} ry={-0.5} />
        {goods.map((g) => <Goods key={g.kind} kind={g.kind} p={g.pos} s={g.s} f={f} />)}
        {goods.map((g, i) => (
          <FlyingCoins key={i} a={add(robot, [0.3, 1.05, 0.3])} b={add(supplier, [0.2, 1.1, 0.1])} t0={g.t0 + 10} n={2} gap={8} dur={30} f={f} h={0.7} seed={i + 3} />
        ))}
        {showBowl && <Bowl p={[bowlP[0], bowlY, bowlP[2]]} fill={midFill} />}
        {badT > 0 && <FlyingCoins a={add(bowlP, [0, 0.5, 0])} b={add(supplier, [0.2, 1.1, 0.1])} t0={w("guess", "bad")} n={34} gap={7} dur={30} f={f} h={0.8} seed={9} />}
        {badT > 0 && <FlyingCoins a={add(supplier, [0.3, 0.9, 0.3])} b={[3.6, -1.2, 1.2]} t0={w("guess", "bad") + 30} n={34} gap={7} dur={26} f={f} h={0.3} seed={10} />}
      </group>
      {/* the good agent that runs out */}
      <group position={L} scale={sides}>
        <Shop pos={[0, 0, 0]} f={f} st={{ kind: "fixed", bowlFill: leftFill, robot: { sad: p(f, runsOut, runsOut + 20), reach: pulse(f, w("guess", "great"), 60) } }}>
          <Queue f={f} t0={w("guess", "great") - 40} n={8} gap={24} seed={5} turnAway={runsOut} payTo={PT.bowl} />
          <FlyingCoins a={PT.bowl} b={PT.supplier} t0={w("guess", "great") - 4} n={12} gap={7} dur={26} f={f} h={0.8} seed={2} />
        </Shop>
      </group>
      {/* the hijacked agent */}
      <group position={R} scale={sides}>
        <Shop pos={[0, 0, 0]} f={f} st={{ kind: "fixed", bowlFill: rightFill, robot: { sad: thiefIn, eyes: lc(K.mint, K.red, thiefIn) } }}>
          <Thief p={SHOP.thief} ry={0.9} f={f} fade={thiefIn} />
          <FlyingCoins a={PT.bowl} b={PT.thief} t0={w("guess", "gets") - 8} n={30} gap={3} dur={22} f={f} h={0.7} seed={4} />
        </Shop>
      </group>
    </group>
  );
};

// ------------------------------------------------------------ the title: kibble falls one piece at a time

export const SetReveal = ({ f }: { f: number }) => {
  const t0 = at("reveal", 0.2);
  const pieces = useMemo(() => {
    const g = rng(77);
    return Array.from({ length: 70 }, (_, i) => {
      // the first few fall slowly, one at a time; then faster
      const start = i < 6 ? i * 26 : 6 * 26 + (i - 6) * 5;
      const a = g() * Math.PI * 2, r = Math.sqrt(g()) * (0.25 + Math.min(1, i / 40) * 0.75);
      return { start, x: Math.cos(a) * r, z: Math.sin(a) * r, h: 0.07 + Math.max(0, 0.55 - r) * Math.min(1, i / 50) * 0.5, rx: g() * 6, ry: g() * 6, spin: 4 + g() * 6, drop: 3.2 + g() * 1.5 };
    });
  }, []);
  return (
    <group>
      <Pedestal p={[0, 0, 0]} r={1.7} rim={K.amber} rimGlow={1.4} />
      {pieces.map((q, i) => {
        const tl = (f - t0 - q.start) / 60;
        if (tl < 0) return null;
        // fall under gravity, one small bounce, then rest
        const g = 9;
        const tFall = Math.sqrt((2 * q.drop) / g);
        let y: number, settle: number;
        if (tl < tFall) {
          y = q.drop - 0.5 * g * tl * tl;
          settle = 0;
        } else {
          const b = tl - tFall, v = g * tFall * 0.22, tb = (2 * v) / g;
          y = b < tb ? v * b - 0.5 * g * b * b : 0;
          settle = Math.min(1, b / (tb + 0.2));
        }
        const rot = (1 - settle) * tl * q.spin;
        return <mesh key={i} geometry={PELLET_GEO} material={PELLET_MAT} position={[q.x, q.h + Math.max(0, y), q.z]} rotation={[q.rx + rot, q.ry + rot * 0.6, 0]} castShadow receiveShadow />;
      })}
    </group>
  );
};

// ------------------------------------------------------------ chapter 2: how it works, in one shop

export const SetShop = ({ f, mode = "explain" }: { f: number; mode?: "explain" | "end" }) => {
  if (mode === "end") {
    // the closing shot: a healthy shop, a full tray, the safe glowing
    const t0 = at("proof");
    return (
      <Shop pos={[0, 0, 0]} f={f} st={{ kind: "kibble", trayW: 1.75, trayN: 10, coins: 18, safeGlow: 0.7 + Math.sin(f / 30) * 0.2, robot: { reach: pulse(f, at("close", 2), 60) * 0.6 } }}>
        <Queue f={f} t0={at("close", 0.5)} n={8} gap={80} seed={21} payTo={PT.tray} />
        <FlyingCoins a={PT.boxTop} b={PT.safeTop} t0={t0 + 60} n={60} gap={28} dur={44} f={f} h={1.1} seed={22} />
      </Shop>
    );
  }
  // box: the agent asks, the box pays
  const ask = w("box", "ask");
  const cant = w("box", "open");
  const denied = pulse(f, cant, 40);
  // tray: slides out, then a customer pays into it
  const trayIn = p(f, w("tray", "tray") - 16, w("tray", "tray") + 18, EASE.out);
  const sale = w("tray", "pays");
  // safe: rises, extra coins fly in; the agent can't reach it
  const safeUp = p(f, at("safe", 0.1), at("safe", 1.0), EASE.back);
  const extra = w("safe", "extra");
  // grow / shrink / earned
  const g1 = p(f, w("grow", "grows") - 10, w("grow", "grows") + 30, EASE.back);
  const g2 = p(f, w("grow", "shrinks") - 10, w("grow", "shrinks") + 30, EASE.back);
  const g3 = p(f, w("grow", "earned") - 10, w("grow", "earned") + 40, EASE.back);
  const trayW = f < at("grow") ? 1.3 * trayIn : lerp(lerp(lerp(1.3, 2.15, g1), 0.9, g2), 1.5, g3);
  const losing = g2 > 0.05 && g3 < 0.5;
  // brakes: the ladder, word by word
  const rung = f < w("brakes", "healthy") ? 0 : f < w("brakes", "watch") ? 0 : f < w("brakes", "braked") ? 1 : f < w("brakes", "paused") ? 2 : 3;
  const unlock = p(f, at("owner", 0.1), at("owner", 0.8));
  const lockAmt = p(f, w("brakes", "paused") - 4, w("brakes", "paused") + 14, EASE.out) * (1 - unlock);
  const light = f >= at("owner") ? (unlock > 0.5 ? K.mint : K.red) : f >= at("brakes") ? LADDER[rung].color : losing ? K.yellow : K.mint;
  const coins = 24 - Math.round(8 * p(f, extra, extra + 60)) - (f > ask + 20 ? 1 : 0);
  const trayCap = Math.max(1, Math.floor((trayW - 0.12) / 0.26)) * 2;
  const trayN = f < sale + 30 ? 3 : f < at("grow") ? 4 : Math.round(trayCap * 0.7);
  const reachSafe = pulse(f, w("safe", "never") - 6, 54);
  return (
    <Shop
      pos={[0, 0, 0]}
      f={f}
      st={{
        kind: "kibble",
        coins,
        trayW,
        trayN,
        trayEdge: losing ? K.red : K.mint,
        trayGlow: 1.4 + (g1 > 0 && g2 < 0.05 ? 1.4 * pulse(f, w("grow", "grows") - 10, 50) : 0),
        safeS: f < at("safe") ? 0 : safeUp,
        safeGlow: 0.3 + 0.9 * p(f, extra + 20, extra + 70) - 0.3 * p(f, at("grow"), at("grow", 1)),
        light,
        locked: lockAmt,
        lockColor: denied > 0.1 || lockAmt > 0.3 ? K.red : K.mint,
        shake: denied,
        shield: reachSafe,
        robot: {
          reach: Math.max(pulse(f, ask - 10, 56) * 0.9, denied * 1.0),
          reachL: reachSafe,
          ry: 0.45 + reachSafe * 0.5,
          sad: Math.max(denied * 0.8, lockAmt, reachSafe * 0.6),
          eyes: lockAmt > 0.5 ? K.red : K.mint,
        },
      }}
    >
      <FlyingCoins a={PT.boxIn} b={PT.supplier} t0={ask + 14} n={1} gap={0} dur={34} f={f} h={1} seed={31} />
      <Queue f={f} t0={sale - 52} n={1} gap={0} seed={32} payTo={PT.tray} />
      <FlyingCoins a={PT.boxTop} b={PT.safeTop} t0={extra} n={8} gap={6} dur={34} f={f} h={1.0} seed={33} />
      {/* growing: a sale clears and the tray widens; losing: coins leave */}
      <FlyingCoins a={PT.counter} b={PT.tray} t0={w("grow", "money") - 20} n={4} gap={6} dur={26} f={f} h={0.6} seed={34} />
      <FlyingCoins a={PT.tray} b={PT.supplier} t0={w("grow", "loses") - 10} n={4} gap={6} dur={28} f={f} h={0.8} seed={35} />
    </Shop>
  );
};

// ------------------------------------------------------------ chapter 3: the test, side by side

export const SetDuel = ({ f }: { f: number }) => {
  const appear = pop(f, w("test", "two") - 10, 36);
  // busy day
  const busy0 = at("busy", 0.2);
  const grew = p(f, w("busy", "grew") - 10, w("busy", "grew") + 30, EASE.back);
  const profit = w("busy", "profit");
  // losing day
  const lost = w("losing", "lost");
  const waves = [w("losing", "paying"), w("losing", "again", 1), w("losing", "again", 2)];
  const fixedDrain = waves.reduce((s, t) => s + 0.18 * p(f, t, t + 40), 0);
  const kLight = f < lost ? K.mint : f < waves[0] ? K.yellow : f < w("losing", "stopped") ? K.orange : K.red;
  const kStop = p(f, w("losing", "stopped") - 4, w("losing", "stopped") + 14) * (1 - p(f, at("thief", 0), at("thief", 0.6)));
  // the thief
  const thiefT = w("thief", "thief", 1);
  const thiefIn = p(f, thiefT - 6, thiefT + 24);
  const spend = w("thief", "spending");
  const kLock = p(f, w("thief", "nothing", 2) - 30, w("thief", "nothing", 2) - 12, EASE.out);
  const inThief = f >= at("thief");
  const fixedFill = inThief ? 1 - p(f, spend - 10, spend + 120, EASE.inOut) * 0.4 : 1 - fixedDrain;
  const losingNow = f >= lost && f < at("thief");
  const fade = p(f, end("thief") - 10, end("thief") + 40, EASE.in);
  return (
    <group>
      <Chain p={DUEL.chain} f={f} n={16} fade={1 - fade * 0.6} />
      <group scale={appear}>
        <Shop pos={DUEL.fixed} f={f} st={{ kind: "fixed", bowlFill: fixedFill, robot: { sad: inThief ? thiefIn : p(f, waves[1], waves[1] + 30) * 0.7, eyes: inThief && thiefIn > 0.5 ? K.red : K.mint } }}>
          <Queue f={f} t0={busy0} n={8} gap={30} seed={41} payTo={PT.bowl} />
          <FlyingCoins a={PT.bowl} b={PT.supplier} t0={busy0 + 50} n={8} gap={30} dur={28} f={f} h={0.8} seed={42} />
          {waves.map((t, i) => <FlyingCoins key={i} a={PT.bowl} b={PT.supplier} t0={t - 6} n={6} gap={5} dur={26} f={f} h={0.8} seed={43 + i} />)}
          <Queue f={f} t0={lost - 30} n={4} gap={60} seed={46} payTo={PT.bowl} />
          {inThief && <Thief p={SHOP.thief} ry={0.9} f={f} fade={thiefIn} />}
          {inThief && <FlyingCoins a={PT.bowl} b={PT.supplier} t0={spend - 6} n={26} gap={6} dur={26} f={f} h={0.8} seed={47} />}
        </Shop>
        <Shop
          pos={DUEL.kibble}
          f={f}
          st={{
            kind: "kibble",
            coins: 16,
            trayW: lerp(1.3, 1.36, grew),
            trayN: losingNow ? 2 : 5,
            light: inThief ? (kLock > 0.3 ? K.red : K.mint) : kLight,
            locked: inThief ? kLock : kStop,
            lockColor: (inThief ? kLock : kStop) > 0.3 ? K.red : K.mint,
            trayEdge: losingNow ? K.orange : K.mint,
            safeGlow: 0.3 + 0.8 * p(f, profit, profit + 60) - 0.5 * p(f, lost, lost + 60),
            robot: { sad: inThief ? kLock : kStop, eyes: (inThief ? kLock : kStop) > 0.5 ? K.red : K.mint },
          }}
        >
          <Queue f={f} t0={busy0} n={8} gap={30} seed={51} payTo={PT.tray} />
          <FlyingCoins a={PT.tray} b={PT.supplier} t0={busy0 + 50} n={8} gap={30} dur={28} f={f} h={0.8} seed={52} />
          <FlyingCoins a={PT.boxTop} b={PT.safeTop} t0={profit - 6} n={8} gap={6} dur={34} f={f} h={1} seed={53} />
          <Queue f={f} t0={lost - 30} n={4} gap={60} seed={54} payTo={PT.tray} />
          <FlyingCoins a={PT.tray} b={PT.supplier} t0={waves[0] - 6} n={3} gap={6} dur={26} f={f} h={0.8} seed={55} />
          {inThief && <Thief p={SHOP.thief} ry={0.9} f={f} fade={thiefIn} />}
          {/* the thief tries; one coin bounces back off the lock */}
          {inThief && f > spend && f < spend + 40 && <Coin p={[lerp(PT.tray[0], PT.thief[0], 0.3 * Math.sin(((f - spend) / 40) * Math.PI)), PT.tray[1] + 0.4 * Math.sin(((f - spend) / 40) * Math.PI), PT.tray[2]]} />}
        </Shop>
      </group>
    </group>
  );
};
