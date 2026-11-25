"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { StorySide } from "@kibble/sdk";
import type { Cue, Stage } from "./stage";

/*
 * One side of the film: a glass cash box filling with grains, the agent that has to ask it, the customers,
 * the supplier, the owner's vault (Kibble only) and the thief. Everything reads the Stage every frame.
 */

export const COL = { saffron: "#ffb000", amber: "#ff8a1f", coral: "#ff4d3d", mint: "#6ee7a8", bone: "#ede8e3", plum: "#1c1622", ink: "#120d17", grey: "#8f8798" };
const BOX = { w: 2.3, h: 1.55, d: 1.65, y: 0.34 };
const P = {
  customer: new THREE.Vector3(-2.9, 1.1, -1.1),
  inlet: new THREE.Vector3(0, BOX.y + BOX.h + 0.25, 0),
  supplier: new THREE.Vector3(2.75, 1.75, -1.75),
  vault: new THREE.Vector3(2.75, 1.0, 1.35),
  thief: new THREE.Vector3(-2.55, 1.35, 1.95),
  wall: new THREE.Vector3(-1.5, 1.35, 1.05),
};
const damp = THREE.MathUtils.damp;
const coral = new THREE.Color(COL.coral);
const rand = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ------------------------------------------------------------------------------------- flying grains

type Fly = { a: THREE.Vector3; m: THREE.Vector3; b: THREE.Vector3; t0: number; dur: number; s: number; bounce: boolean; col: THREE.Color; jx: number; jy: number; jz: number };
const MAX = 640;

function Flows({ stage, side }: { stage: Stage; side: StorySide }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const list = useRef<Fly[]>([]);
  const clock = useRef(0);
  const o = useMemo(() => new THREE.Object3D(), []);
  const cols = useMemo(() => ({ money: new THREE.Color(side === "kibble" ? COL.saffron : "#f2d7a0").multiplyScalar(1.7), bone: new THREE.Color(COL.bone).multiplyScalar(1.1), coral: new THREE.Color(COL.coral).multiplyScalar(2.2), mint: new THREE.Color(COL.mint).multiplyScalar(1.5) }), [side]);

  useEffect(
    () =>
      stage.on((c: Cue) => {
        if (c.side !== side || c.kind === "say" || c.kind === "state") return;
        const n = c.small ? 16 : 46;
        const dur = c.small ? 0.62 : 1.05;
        const add = (a: THREE.Vector3, b: THREE.Vector3, col: THREE.Color, lift: number, opt: { bounce?: boolean; delay?: number; n?: number } = {}) => {
          const m = a.clone().lerp(b, 0.5);
          m.y += lift;
          const count = opt.n ?? n;
          for (let i = 0; i < count; i++) {
            if (list.current.length >= MAX) list.current.shift();
            list.current.push({ a, m, b, t0: clock.current + (opt.delay ?? 0) + (i / count) * (c.small ? 0.22 : 0.5), dur: dur * (0.85 + Math.random() * 0.3), s: 0.5 + Math.random() * 0.6, bounce: Boolean(opt.bounce), col, jx: (Math.random() - 0.5) * 0.5, jy: (Math.random() - 0.5) * 0.4, jz: (Math.random() - 0.5) * 0.5 });
          }
        };
        if (c.kind === "sale") add(P.customer, P.inlet, cols.money, 1.5);
        if (c.kind === "buy") add(P.inlet, P.supplier, cols.bone, 1.3, { delay: c.small ? 0 : 0.35 });
        if (c.kind === "theft") add(P.inlet, P.supplier, cols.coral, 1.5);
        if (c.kind === "vault") add(P.inlet, P.vault, cols.mint, 1.4);
        if (c.kind === "refund") add(P.inlet, P.customer, cols.bone, 1.3, { n: Math.ceil(n / 2) });
        if (c.kind === "refused") add(c.by === "agent" ? P.supplier : P.thief, c.by === "agent" ? P.inlet : P.wall, cols.coral, c.by === "agent" ? 1.1 : 0.7, { bounce: true });
      }),
    [stage, side, cols],
  );

  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.05);
    const im = mesh.current;
    if (!im) return;
    const now = clock.current;
    const keep: Fly[] = [];
    let k = 0;
    for (const f of list.current) {
      const raw = (now - f.t0) / f.dur;
      if (raw >= 1) continue;
      keep.push(f);
      if (raw < 0) continue;
      const e = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
      const u = f.bounce ? (raw < 0.5 ? e * 2 * 0.94 : 0.94 - (e - 0.5) * 1.1) : e;
      const v = 1 - u;
      const spread = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
      o.position.set(
        v * v * f.a.x + 2 * v * u * f.m.x + u * u * f.b.x + f.jx * spread,
        v * v * f.a.y + 2 * v * u * f.m.y + u * u * f.b.y + f.jy * spread - (f.bounce && raw > 0.5 ? (raw - 0.5) ** 2 * 3 : 0),
        v * v * f.a.z + 2 * v * u * f.m.z + u * u * f.b.z + f.jz * spread,
      );
      o.rotation.set(now * 3 + f.jx * 9, now * 2 + f.jy * 9, 0);
      o.scale.setScalar(0.07 * f.s * Math.min(1, raw * 7, (1 - raw) * 6));
      o.updateMatrix();
      im.setMatrixAt(k, o.matrix);
      im.setColorAt(k, f.col);
      k++;
    }
    list.current = keep;
    im.count = k;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------------------------- the cash box

const FILL = 760;

function CashBox({ stage, side }: { stage: Stage; side: StorySide }) {
  const kib = side === "kibble";
  const fill = useRef<THREE.InstancedMesh>(null);
  const lid = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const edge = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a2d46", emissive: kib ? COL.saffron : COL.grey, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 }), [kib]);
  const band = useMemo(() => new THREE.MeshBasicMaterial({ color: kib ? "#ffc84d" : "#f3ece6", transparent: true, opacity: 0.9, toneMapped: false }), [kib]);
  const lock = useRef<THREE.Group>(null);
  const lockMat = useRef<THREE.MeshBasicMaterial>(null);
  const level = useRef(0);
  const lim = useRef(0.2);
  const shut = useRef(0);
  const hit = useRef(0);

  // kibble poured into the box: packed once, revealed from the bottom up
  useEffect(() => {
    const im = fill.current;
    if (!im) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const pts = Array.from({ length: FILL }, (_, i) => {
      const y = i / FILL;
      return { x: (rand(i, 1) - 0.5) * (BOX.w - 0.34), y: y * (BOX.h - 0.16) + (rand(i, 2) - 0.5) * 0.1, z: (rand(i, 3) - 0.5) * (BOX.d - 0.34), r: 0.075 + rand(i, 4) * 0.05, q: rand(i, 5) };
    });
    pts.forEach((p, i) => {
      o.position.set(p.x, BOX.y + 0.1 + Math.max(0, p.y), p.z);
      o.rotation.set(p.q * 6, p.q * 11, p.q * 17);
      o.scale.setScalar(p.r);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      c.set(kib ? (p.q > 0.8 ? "#ffd266" : p.q > 0.4 ? COL.saffron : "#e08a00") : p.q > 0.6 ? "#cfc6bd" : "#9d94a0");
      im.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [kib]);

  useEffect(
    () =>
      stage.on((c) => {
        if (c.kind === "refused" && c.side === side) hit.current = 1;
      }),
    [stage, side],
  );

  useFrame(({ clock }, dt) => {
    const s = stage.sides[side];
    const stopped = s.state === "Paused";
    level.current = damp(level.current, Math.min(1, s.can / stage.scale), 3.2, dt);
    lim.current = damp(lim.current, Math.min(1, s.limit / stage.scale), 2.4, dt);
    shut.current = damp(shut.current, stopped ? 1 : 0, 5, dt);
    hit.current = Math.max(0, hit.current - dt * 1.8);
    if (fill.current) fill.current.count = Math.round(level.current * FILL);
    if (lid.current) lid.current.rotation.x = -3.02 * (1 - shut.current);
    if (ring.current) ring.current.position.y = BOX.y + 0.1 + lim.current * (BOX.h - 0.16);
    band.opacity = 0.78 + Math.sin(clock.elapsedTime * 2.2) * 0.14;
    const danger = Math.max(hit.current, shut.current * 0.8);
    edge.emissive.set(kib ? COL.saffron : COL.grey).lerp(coral, danger);
    edge.emissiveIntensity = (kib ? 0.75 : 0.3) + danger * 1.6;
    if (lock.current) {
      lock.current.scale.setScalar(0.001 + shut.current);
      lock.current.position.y = BOX.y + BOX.h * 0.52 + Math.sin(clock.elapsedTime * 3) * 0.01;
    }
    if (lockMat.current) lockMat.current.color.set(COL.coral).multiplyScalar(1.6);
  });

  const bar = 0.05;
  const posts: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  return (
    <group>
      <RoundedBox args={[BOX.w + 0.5, 0.3, BOX.d + 0.5]} radius={0.09} smoothness={4} position={[0, 0.15, 0]}>
        <meshStandardMaterial color="#4a3b58" metalness={0.55} roughness={0.36} envMapIntensity={1.4} />
      </RoundedBox>
      <instancedMesh ref={fill} args={[undefined, undefined, FILL]} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.5} metalness={0.15} emissive={kib ? "#7a4300" : "#1a161e"} emissiveIntensity={kib ? 0.55 : 0.3} />
      </instancedMesh>
      {/* glass */}
      <mesh position={[0, BOX.y + BOX.h / 2, 0]}>
        <boxGeometry args={[BOX.w, BOX.h, BOX.d]} />
        <meshPhysicalMaterial color="#e9e2ff" transparent opacity={0.1} roughness={0.04} metalness={0} clearcoat={1} envMapIntensity={1.6} depthWrite={false} />
      </mesh>
      {/* frame */}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[(x * BOX.w) / 2, BOX.y + BOX.h / 2, (z * BOX.d) / 2]}>
          <boxGeometry args={[bar, BOX.h, bar]} />
          <primitive object={edge} attach="material" />
        </mesh>
      ))}
      {[-1, 1].map((z) => (
        <mesh key={`t${z}`} position={[0, BOX.y + BOX.h, (z * BOX.d) / 2]}>
          <boxGeometry args={[BOX.w + bar, bar, bar]} />
          <primitive object={edge} attach="material" />
        </mesh>
      ))}
      {[-1, 1].map((x) => (
        <mesh key={`s${x}`} position={[(x * BOX.w) / 2, BOX.y + BOX.h, 0]}>
          <boxGeometry args={[bar, bar, BOX.d]} />
          <primitive object={edge} attach="material" />
        </mesh>
      ))}
      {/* the limit: a band around the box */}
      <group ref={ring}>
        {[-1, 1].map((z) => (
          <mesh key={`a${z}`} position={[0, 0, z * (BOX.d / 2 + 0.07)]}>
            <boxGeometry args={[BOX.w + 0.19, 0.045, 0.045]} />
            <primitive object={band} attach="material" />
          </mesh>
        ))}
        {[-1, 1].map((x) => (
          <mesh key={`b${x}`} position={[x * (BOX.w / 2 + 0.07), 0, 0]}>
            <boxGeometry args={[0.045, 0.045, BOX.d + 0.19]} />
            <primitive object={band} attach="material" />
          </mesh>
        ))}
      </group>
      {/* lid, hinged at the back */}
      <group ref={lid} position={[0, BOX.y + BOX.h + 0.05, -BOX.d / 2]} rotation={[-3.02, 0, 0]}>
        <RoundedBox args={[BOX.w + 0.16, 0.12, BOX.d + 0.14]} radius={0.05} smoothness={3} position={[0, 0.05, BOX.d / 2]}>
          <meshStandardMaterial color="#6a5878" metalness={0.55} roughness={0.35} />
        </RoundedBox>
      </group>
      {/* padlock */}
      <group ref={lock} position={[0, BOX.y + BOX.h * 0.52, BOX.d / 2 + 0.14]}>
        <mesh>
          <boxGeometry args={[0.46, 0.38, 0.14]} />
          <meshBasicMaterial ref={lockMat} color={COL.coral} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <torusGeometry args={[0.15, 0.045, 10, 24, Math.PI]} />
          <meshBasicMaterial color={COL.coral} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.01, 0.075]}>
          <circleGeometry args={[0.06, 16]} />
          <meshBasicMaterial color="#2a0b08" />
        </mesh>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------------------------- the agent

function Agent({ stage, side }: { stage: Stage; side: StorySide }) {
  const g = useRef<THREE.Group>(null);
  const eyes = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffd27a", toneMapped: false }), []);
  const ask = useRef(0);
  const down = useRef(0);
  useEffect(
    () =>
      stage.on((c) => {
        if (c.side === side && (c.kind === "buy" || (c.kind === "refused" && c.by === "agent"))) ask.current = 1;
      }),
    [stage, side],
  );
  useEffect(() => {
    const id = `${side}:say-agent`;
    stage.pins.set(id, (v) => (g.current ? g.current.localToWorld(v.set(-0.1, 1.0, 0)) : v.set(0, -99, 0)));
    return () => void stage.pins.delete(id);
  }, [stage, side]);

  useFrame(({ clock }, dt) => {
    const stopped = stage.sides[side].state === "Paused";
    ask.current = Math.max(0, ask.current - dt * 1.1);
    down.current = damp(down.current, stopped ? 1 : 0, 4, dt);
    const t = clock.elapsedTime + (side === "fixed" ? 1.7 : 0);
    if (g.current) {
      const lean = Math.sin(Math.min(1, ask.current) * Math.PI);
      g.current.position.set(-1.72 + lean * 0.35, 1.72 + Math.sin(t * 1.6) * 0.07 - down.current * 0.75, 1.15 - lean * 0.2);
      g.current.rotation.set(down.current * 0.5 + lean * 0.12, 0.55 + Math.sin(t * 0.7) * 0.12, Math.sin(t * 1.1) * 0.03);
    }
    {
      const blink = Math.sin(t * 0.9) > 0.992 ? 0.1 : 1;
      eyes.color.set(stopped ? COL.coral : side === "kibble" ? "#ffd27a" : "#cfe4ff").multiplyScalar((stopped ? 0.7 : 1.5) * blink);
    }
  });

  return (
    <>
      <group ref={g} position={[-1.72, 1.72, 1.15]} scale={0.95}>
        <RoundedBox args={[0.62, 0.5, 0.5]} radius={0.16} smoothness={5}>
          <meshStandardMaterial color="#efe8e0" metalness={0.25} roughness={0.35} />
        </RoundedBox>
        <RoundedBox args={[0.46, 0.27, 0.06]} radius={0.09} smoothness={4} position={[0, 0.01, 0.24]}>
          <meshStandardMaterial color="#120d17" metalness={0.4} roughness={0.2} />
        </RoundedBox>
        {[-1, 1].map((x) => (
          <mesh key={x} position={[x * 0.105, 0.02, 0.285]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <primitive object={eyes} attach="material" />
          </mesh>
        ))}
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.22, 8]} />
          <meshStandardMaterial color="#9a92a3" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.49, 0]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color={side === "kibble" ? "#ffc84d" : "#cfe4ff"} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <capsuleGeometry args={[0.19, 0.16, 6, 16]} />
          <meshStandardMaterial color="#d8cfc6" metalness={0.25} roughness={0.4} />
        </mesh>
      </group>
    </>
  );
}

// ------------------------------------------------------------------------------------- customers

const COATS = ["#b79ad6", "#d6a78a", "#8fb6d6", "#c9c08f", "#d69ab0"];
type Person = { slot: number; mode: "in" | "wait" | "ok" | "no"; t: number };
const PEOPLE = 5;

function Customers({ stage, side }: { stage: Stage; side: StorySide }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const ppl = useRef<Person[]>(Array.from({ length: PEOPLE }, (_, i) => ({ slot: i, mode: "wait", t: 0 })));

  useEffect(
    () =>
      stage.on((c) => {
        if (c.side !== side) return;
        const front = ppl.current.reduce((a, b) => (a.slot < b.slot ? a : b));
        if (c.kind === "served" && front.mode !== "ok" && front.mode !== "no") Object.assign(front, { mode: "ok", t: 0 });
        if (c.kind === "turned" && front.mode !== "ok" && front.mode !== "no") Object.assign(front, { mode: "no", t: 0 });
      }),
    [stage, side],
  );

  useFrame(({ clock }, dt) => {
    ppl.current.forEach((p, i) => {
      const g = refs.current[i];
      const m = mats.current[i];
      if (!g || !m) return;
      p.t += dt;
      if ((p.mode === "ok" || p.mode === "no") && p.t > 0.55) {
        for (const q of ppl.current) if (q !== p) q.slot -= 1;
        p.slot = PEOPLE - 1;
        p.mode = "in";
        p.t = 0;
        g.position.set(-6.4, 0, -2.6);
      }
      const leaving = p.mode === "ok" || p.mode === "no";
      const tx = -2.75 - p.slot * 0.72;
      const tz = -1.15 - p.slot * 0.34;
      g.position.x = damp(g.position.x, leaving ? tx - 0.4 : tx, 5, dt);
      g.position.z = damp(g.position.z, leaving ? tz - 1.5 : tz, 5, dt);
      g.position.y = p.mode === "ok" ? Math.abs(Math.sin(p.t * 9)) * 0.32 : Math.sin(clock.elapsedTime * 2 + i) * 0.015;
      g.rotation.z = p.mode === "no" ? Math.sin(p.t * 22) * 0.12 : 0;
      const to = p.mode === "ok" ? COL.mint : p.mode === "no" ? COL.coral : COATS[i % COATS.length];
      m.color.lerp(new THREE.Color(to), 0.25);
      m.emissive.set(p.mode === "ok" ? COL.mint : p.mode === "no" ? COL.coral : "#000000");
      m.emissiveIntensity = leaving ? 0.7 : 0;
      if (p.mode === "in" && p.t > 0.4) p.mode = "wait";
    });
  });

  return (
    <group>
      {Array.from({ length: PEOPLE }, (_, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} position={[-2.75 - i * 0.72, 0, -1.15 - i * 0.34]}>
          <mesh position={[0, 0.48, 0]}>
            <capsuleGeometry args={[0.2, 0.42, 6, 16]} />
            <meshStandardMaterial ref={(m) => void (mats.current[i] = m)} color="#b9aec2" roughness={0.55} />
          </mesh>
          <mesh position={[0, 1.04, 0]}>
            <sphereGeometry args={[0.17, 20, 20]} />
            <meshStandardMaterial color="#e6ddd5" roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------------------------- supplier

function Supplier({ stage, side }: { stage: Stage; side: StorySide }) {
  const leds = useRef<THREE.InstancedMesh>(null);
  const hot = useRef(0);
  const bad = useRef(false);
  const o = useMemo(() => new THREE.Object3D(), []);
  useEffect(
    () =>
      stage.on((c) => {
        if (c.side === side && (c.kind === "buy" || c.kind === "theft")) {
          hot.current = 1.4;
          bad.current = c.kind === "theft";
        }
      }),
    [stage, side],
  );
  useFrame(({ clock }, dt) => {
    hot.current = Math.max(0, hot.current - dt);
    const im = leds.current;
    if (!im) return;
    const c = new THREE.Color();
    for (let i = 0; i < 12; i++) {
      o.position.set(-0.42 + (i % 3) * 0.16, 0.32 + Math.floor(i / 3) * 0.52, 0.5);
      o.scale.setScalar(0.035);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      const on = Math.sin(clock.elapsedTime * (2 + (i % 5)) + i * 1.7) > 0.2 || hot.current > 0.2;
      c.set(hot.current > 0.1 ? (bad.current ? COL.coral : COL.saffron) : "#8f87ff").multiplyScalar(on ? 1.5 + hot.current : 0.25);
      im.setColorAt(i, c);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return (
    <group position={[2.75, 0, -1.75]} rotation={[0, -0.4, 0]} scale={0.92}>
      {[0, 1, 2, 3].map((i) => (
        <RoundedBox key={i} args={[1.25, 0.42, 0.95]} radius={0.07} smoothness={3} position={[0, 0.3 + i * 0.52, 0]}>
          <meshStandardMaterial color="#54456a" metalness={0.5} roughness={0.38} envMapIntensity={1.4} />
        </RoundedBox>
      ))}
      <instancedMesh ref={leds} args={[undefined, undefined, 12]}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

// ------------------------------------------------------------------------------------- vault

function Vault({ stage }: { stage: Stage }) {
  const door = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const rim = useRef<THREE.MeshStandardMaterial>(null);
  const open = useRef(0);
  const want = useRef(0);
  useEffect(
    () =>
      stage.on((c) => {
        if (c.kind === "vault") want.current = 1.5;
      }),
    [stage],
  );
  useFrame(({ clock }, dt) => {
    want.current = Math.max(0, want.current - dt);
    open.current = damp(open.current, want.current > 0.15 ? 1 : 0, 4.5, dt);
    if (door.current) door.current.rotation.y = -1.75 * open.current;
    if (wheel.current) wheel.current.rotation.z = open.current * 4.2 + Math.sin(clock.elapsedTime * 0.5) * 0.05;
    if (glow.current) glow.current.color.set("#3a2608").lerp(new THREE.Color("#b8822a"), open.current * 0.8);
    if (rim.current) rim.current.emissiveIntensity = 0.06 + open.current * 0.8;
  });
  return (
    <group position={[2.95, 0.98, 1.35]} rotation={[0, -0.5, 0]} scale={0.82}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.08, 1.08, 0.95, 56, 1, true]} />
        <meshStandardMaterial color="#6b5a80" metalness={0.6} roughness={0.34} side={THREE.DoubleSide} envMapIntensity={1.3} />
      </mesh>
      <mesh position={[0, 0, -0.46]}>
        <circleGeometry args={[1.06, 56]} />
        <meshBasicMaterial ref={glow} color={COL.saffron} toneMapped={false} />
      </mesh>
      <Hoard />
      <mesh position={[0, 0, 0.47]}>
        <torusGeometry args={[1.08, 0.085, 18, 72]} />
        <meshStandardMaterial ref={rim} color="#86749c" emissive={COL.mint} emissiveIntensity={0.1} metalness={0.7} roughness={0.26} />
      </mesh>
      <group ref={door} position={[-1, 0, 0.5]}>
        <group position={[1, 0, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[1, 1, 0.2, 56]} />
            <meshStandardMaterial color="#7a688f" metalness={0.6} roughness={0.32} envMapIntensity={1.5} />
          </mesh>
          <mesh position={[0, 0, 0.105]}>
            <ringGeometry args={[0.6, 0.66, 56]} />
            <meshStandardMaterial color="#b9a6cf" metalness={0.8} roughness={0.25} />
          </mesh>
          {Array.from({ length: 10 }, (_, i) => (
            <mesh key={i} position={[Math.cos((i / 10) * 6.283) * 0.82, Math.sin((i / 10) * 6.283) * 0.82, 0.12]}>
              <sphereGeometry args={[0.055, 14, 14]} />
              <meshStandardMaterial color="#e7dcf3" metalness={0.7} roughness={0.25} />
            </mesh>
          ))}
          <group ref={wheel} position={[0, 0, 0.2]}>
            <mesh>
              <torusGeometry args={[0.36, 0.05, 14, 44]} />
              <meshStandardMaterial color="#f2e9dd" metalness={0.65} roughness={0.25} />
            </mesh>
            {[0, 1, 2].map((i) => (
              <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
                <boxGeometry args={[0.9, 0.06, 0.05]} />
                <meshStandardMaterial color="#f2e9dd" metalness={0.65} roughness={0.25} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
      <mesh position={[0, -1.1, 0]}>
        <boxGeometry args={[1.6, 0.14, 1.2]} />
        <meshStandardMaterial color="#3d314a" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** The grains already saved inside the vault. */
function Hoard() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const im = ref.current;
    if (!im) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < 170; i++) {
      const x = (rand(i, 7) - 0.5) * 1.7;
      const floor = -Math.sqrt(Math.max(0, 0.98 * 0.98 - x * x));
      o.position.set(x, floor + 0.08 + rand(i, 8) * 0.5 * (1 - Math.abs(x)), -0.35 + rand(i, 9) * 0.55);
      o.rotation.set(i, i * 2, i * 3);
      o.scale.setScalar(0.06 + rand(i, 10) * 0.045);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, c.set(rand(i, 11) > 0.5 ? "#8ff0bd" : "#ffcf5c"));
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 170]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={0.45} emissive="#5a4300" emissiveIntensity={0.7} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------------------------- thief, shield, keys

function Thief({ stage, side }: { stage: Stage; side: StorySide }) {
  const g = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const up = useRef(0);
  const jab = useRef(0);
  useEffect(
    () =>
      stage.on((c) => {
        if (c.side === side && (c.kind === "theft" || (c.kind === "refused" && c.by !== "agent"))) jab.current = 1;
      }),
    [stage, side],
  );
  useFrame(({ clock }, dt) => {
    up.current = damp(up.current, stage.thief, 2.2, dt);
    jab.current = Math.max(0, jab.current - dt * 2.4);
    if (!g.current) return;
    g.current.visible = up.current > 0.01;
    const j = Math.sin(jab.current * Math.PI);
    g.current.position.set(-2.6 + j * 0.4, -2.9 + up.current * 2.9 + Math.sin(clock.elapsedTime * 1.3) * 0.03, 2.2 - j * 0.25);
    if (arm.current) arm.current.rotation.x = -0.15 - j * 0.5;
  });
  return (
    <group ref={g} rotation={[0, 0.55, 0]} visible={false} scale={1.12}>
      <pointLight position={[0.2, 2.1, 1.6]} intensity={9} distance={4.5} color={COL.coral} />
      <mesh position={[0, 0.7, 0]}>
        <coneGeometry args={[0.66, 1.55, 36, 1]} />
        <meshStandardMaterial color="#5a1f29" roughness={0.62} emissive="#4a0d10" emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, 1.44, -0.02]}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial color="#6b2631" roughness={0.6} emissive="#4a0d10" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 1.42, 0.17]} scale={[1, 0.92, 0.75]}>
        <sphereGeometry args={[0.3, 28, 28]} />
        <meshStandardMaterial color="#12060a" roughness={0.9} />
      </mesh>
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x * 0.115, 1.45, 0.375]} scale={[1.55, 0.8, 0.6]} rotation={[0, 0, x * -0.28]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial color={new THREE.Color(COL.coral).multiplyScalar(2.8)} toneMapped={false} />
        </mesh>
      ))}
      <group ref={arm} position={[0.5, 0.95, 0.2]} rotation={[0, 0.9, 0]}>
        <mesh position={[0, 0.05, 0.12]}>
          <torusGeometry args={[0.17, 0.05, 14, 32]} />
          <meshBasicMaterial color={new THREE.Color("#ffc84d").multiplyScalar(1.5)} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.05, 0.54]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.56, 12]} />
          <meshBasicMaterial color={new THREE.Color("#ffc84d").multiplyScalar(1.5)} toneMapped={false} />
        </mesh>
        {[0.66, 0.78].map((z) => (
          <mesh key={z} position={[0, -0.05, z]}>
            <boxGeometry args={[0.055, 0.18, 0.055]} />
            <meshBasicMaterial color={new THREE.Color("#ffc84d").multiplyScalar(1.5)} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const shieldMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uHit: { value: 0 }, uTime: { value: 0 } },
    vertexShader: "varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 w = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-w.xyz); vP = position; gl_Position = projectionMatrix*w; }",
    fragmentShader:
      "uniform float uHit; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP; float hex(vec2 p){ p.x*=1.1547; p.y+=mod(floor(p.x),2.0)*0.5; p=abs(mod(p,1.0)-0.5); return abs(max(p.x*1.5+p.y,p.y*2.0)-1.0);} void main(){ float f = pow(max(0.0, 1.0-abs(dot(normalize(vN),normalize(vV)))),2.2); vec2 q = vec2(atan(vP.z,vP.x)*3.0, vP.y*3.2); float h = smoothstep(0.12,0.0,hex(q)); vec3 d = normalize(vP) - normalize(vec3(-1.0,0.35,0.75)); float spot = exp(-dot(d,d)*2.2); float a = uHit*(f*0.75 + h*0.5*spot + spot*0.28); gl_FragColor = vec4(vec3(1.0,0.30,0.22)*1.8, a); }",
  });

function Shield({ stage, side }: { stage: Stage; side: StorySide }) {
  const mat = useMemo(shieldMat, []);
  const hit = useRef(0);
  useEffect(
    () =>
      stage.on((c) => {
        if (c.side === side && c.kind === "refused") hit.current = 1;
      }),
    [stage, side],
  );
  useFrame(({ clock }, dt) => {
    hit.current = Math.max(0, hit.current - dt * 0.95);
    mat.uniforms.uHit.value = hit.current * hit.current * (3 - 2 * hit.current);
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh position={[0, 1.05, 0]} scale={[1, 0.86, 0.95]} material={mat}>
      <sphereGeometry args={[2.05, 48, 32]} />
    </mesh>
  );
}

function Keys({ stage }: { stage: Stage }) {
  const a = useRef<THREE.Group>(null);
  const b = useRef<THREE.Group>(null);
  const t = useRef(0);
  const inner = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }, dt) => {
    t.current = damp(t.current, stage.keys, 2.4, dt);
    const u = Math.min(1, t.current);
    const turn = Math.max(0, t.current - 1);
    [a, b].forEach((r, i) => {
      const g = r.current;
      if (!g) return;
      const s = i ? 1 : -1;
      g.visible = u > 0.02;
      if (!inner.current[i]) return;
      g.position.set(s * (2.6 - u * 1.62), BOX.y + BOX.h * 0.52 + (1 - u) * 0.9 + Math.sin(clock.elapsedTime * 2 + i) * 0.015 * (2 - u), BOX.d / 2 + 0.34);
      g.rotation.set(turn * 1.5, 0, 0);
      inner.current[i]!.rotation.y = (s * Math.PI) / 2;
      g.scale.setScalar(u);
    });
  });
  const key = (col: string) => (
    <>
      <mesh position={[0, 0, 0.5]}>
        <torusGeometry args={[0.2, 0.055, 14, 32]} />
        <meshBasicMaterial color={new THREE.Color(col).multiplyScalar(1.5)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.62, 12]} />
        <meshBasicMaterial color={new THREE.Color(col).multiplyScalar(1.5)} toneMapped={false} />
      </mesh>
      {[-0.06, -0.18].map((z) => (
        <mesh key={z} position={[0, -0.1, z]}>
          <boxGeometry args={[0.06, 0.2, 0.06]} />
          <meshBasicMaterial color={new THREE.Color(col).multiplyScalar(1.5)} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
  return (
    <>
      <group ref={a} visible={false}>
        <group ref={(g) => void (inner.current[0] = g)}>{key(COL.saffron)}</group>
      </group>
      <group ref={b} visible={false}>
        <group ref={(g) => void (inner.current[1] = g)}>{key(COL.mint)}</group>
      </group>
    </>
  );
}

export function Island({ stage, side, x }: { stage: Stage; side: StorySide; x: number }) {
  const kib = side === "kibble";
  useEffect(() => {
    const at: [string, number, number, number][] = [
      ["name", 0, 0.06, 3.4],
      ["customers", -3.6, 1.75, -1.7],
      ["supplier", 2.75, 2.55, -1.75],
      ["thief", -2.6, 2.5, 2.2],
      ["num", 0, BOX.y - 0.2, BOX.d / 2 + 0.4],
      ["say-box", 0.15, BOX.y + BOX.h + 0.5, 0.5],
      ...(kib ? ([["vault", 2.95, 2.2, 1.35]] as [string, number, number, number][]) : []),
    ];
    for (const [k, px, py, pz] of at) stage.pins.set(`${side}:${k}`, (v) => void v.set(x + px, py, pz));
    return () => at.forEach(([k]) => stage.pins.delete(`${side}:${k}`));
  }, [stage, side, x, kib]);
  const lamp = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const pool = useMemo(() => ({ c: { value: new THREE.Color(kib ? "#b86a00" : "#5a5270") }, k: { value: 0.4 } }), [kib]);
  useFrame((_, dt) => {
    pool.k.value = damp(pool.k.value, 0.4 * Math.min(1.2, stage.lit[side]), 2.5, dt);
    if (!lamp.current) return;
    const bad = stage.sides[side].state === "Paused" ? 1 : stage.mood;
    lamp.current.intensity = damp(lamp.current.intensity, 190 * stage.lit[side], 2.5, dt);
    lamp.current.color.lerp(new THREE.Color(kib ? "#ffd9a0" : "#d9dcff").lerp(new THREE.Color("#ff8f80"), bad * 0.55), 0.06);
  });
  return (
    <group position={[x, 0, 0]}>
      <primitive object={target} position={[0, 0.6, 0]} />
      <spotLight ref={lamp} position={[kib ? 1.5 : -1.5, 8.5, 4.2]} target={target} angle={0.52} penumbra={0.9} intensity={190} color={kib ? "#ffd9a0" : "#d9dcff"} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[3.95, 4, 96]} />
        <meshBasicMaterial color={kib ? COL.saffron : "#6c6476"} transparent opacity={kib ? 0.7 : 0.35} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <circleGeometry args={[5.2, 64]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={pool}
          vertexShader="varying vec2 vU; void main(){ vU = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }"
          fragmentShader="varying vec2 vU; uniform vec3 c; uniform float k; void main(){ float d = length(vU); gl_FragColor = vec4(c, pow(max(0.0,1.0-d),1.7)*k); }"
        />
      </mesh>
      {[
        [0, 0, 2.1, 1.6],
        [2.75, -1.75, 1.2, 1.0],
        ...(kib ? [[2.95, 1.35, 1.25, 1.0]] : []),
      ].map(([sx, sz, rx, rz], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[sx, 0.009, sz]} scale={[rx, rz, 1]}>
          <circleGeometry args={[1, 40]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            vertexShader="varying vec2 vU; void main(){ vU = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }"
            fragmentShader="varying vec2 vU; void main(){ float d = min(1.0,length(vU)); gl_FragColor = vec4(0.02,0.01,0.03,(1.0-smoothstep(0.35,1.0,d))*0.75); }"
          />
        </mesh>
      ))}
      <CashBox stage={stage} side={side} />
      <Agent stage={stage} side={side} />
      <Customers stage={stage} side={side} />
      <Supplier stage={stage} side={side} />
      {kib && <Vault stage={stage} />}
      <Thief stage={stage} side={side} />
      <Shield stage={stage} side={side} />
      {kib && <Keys stage={stage} />}
      <Flows stage={stage} side={side} />
    </group>
  );
}
