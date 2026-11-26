import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { K } from "./theme";

/** Every model in the film, built from code: original, and sharp at any size. All inputs are plain numbers per frame. */

export type V3 = [number, number, number];

// ------------------------------------------------------------ shared geometry and materials

const lathe = (pts: [number, number][], seg = 48) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

export const COIN_GEO = lathe([
  [0, 0.013], [0.084, 0.013], [0.094, 0.02], [0.116, 0.02], [0.122, 0.012], [0.122, -0.012], [0.116, -0.02], [0.094, -0.02], [0.084, -0.013], [0, -0.013],
]);
export const COIN_MAT = new THREE.MeshStandardMaterial({ color: K.gold, metalness: 1, roughness: 0.26, emissive: "#7a4d00", emissiveIntensity: 0.35 });

const BOWL_GEO = lathe([
  [0, 0.02], [0.55, 0.02], [0.82, 0.12], [0.98, 0.34], [1.02, 0.42], [0.96, 0.42], [0.92, 0.36], [0.78, 0.18], [0.52, 0.09], [0, 0.09],
], 64);

const steel = (color = "#2a335e", rough = 0.35) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.85, roughness: rough, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const MAT = {
  cream: new THREE.MeshPhysicalMaterial({ color: K.cream, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.4 }),
  face: new THREE.MeshPhysicalMaterial({ color: "#070b1c", roughness: 0.12, clearcoat: 1, metalness: 0.2 }),
  chrome: new THREE.MeshStandardMaterial({ color: "#d9def5", metalness: 1, roughness: 0.18 }),
  steel: steel(),
  steelDark: steel("#1a2045", 0.42),
  deck: new THREE.MeshPhysicalMaterial({ color: K.deck, roughness: 0.55, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.4 }),
  deckTop: new THREE.MeshPhysicalMaterial({ color: "#18214a", roughness: 0.4, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.25 }),
  floor: new THREE.MeshStandardMaterial({ color: "#0a1126", roughness: 0.82, metalness: 0.05 }),
  glass: new THREE.MeshPhysicalMaterial({ color: "#d8f3ff", transmission: 1, thickness: 0.35, roughness: 0.06, ior: 1.42, metalness: 0, clearcoat: 1, attenuationColor: new THREE.Color("#9fe9ff"), attenuationDistance: 2.5, transparent: true, opacity: 1 }),
  thief: new THREE.MeshPhysicalMaterial({ color: "#151a2e", roughness: 0.75, sheen: 1, sheenColor: new THREE.Color("#3a2240") }),
  crate: new THREE.MeshPhysicalMaterial({ color: "#5866d8", roughness: 0.45, clearcoat: 0.6 }),
  crateLid: new THREE.MeshPhysicalMaterial({ color: "#8a96ff", roughness: 0.4, clearcoat: 0.6 }),
};
const glow = (color: string, intensity = 3) => <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />;

// ------------------------------------------------------------ deterministic randomness

export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------ coins

export const Coin = ({ p, r = [0, 0, 0], s = 1 }: { p: V3; r?: V3; s?: number }) =>
  s <= 0.001 ? null : <mesh geometry={COIN_GEO} material={COIN_MAT} position={p} rotation={r} scale={s} castShadow />;

/** A coin in flight from a to b along an arc, t in 0..1, spinning. */
export const arcPoint = (a: V3, b: V3, h: number, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t + 4 * h * t * (1 - t),
  a[2] + (b[2] - a[2]) * t,
];
export const FlyingCoins = ({ a, b, t0, n, gap, dur, f, h = 1, seed = 1, s = 1 }: { a: V3; b: V3; t0: number; n: number; gap: number; dur: number; f: number; h?: number; seed?: number; s?: number }) => {
  const r = useMemo(() => {
    const g = rng(seed);
    return Array.from({ length: n }, () => [g(), g(), g()]);
  }, [n, seed]);
  return (
    <>
      {r.map(([x, y, z], i) => {
        const t = (f - t0 - i * gap) / dur;
        if (t <= 0 || t >= 1) return null;
        const jitter: V3 = [(x - 0.5) * 0.18, 0, (z - 0.5) * 0.18];
        const pa: V3 = [a[0] + jitter[0], a[1], a[2] + jitter[2]];
        const pos = arcPoint(pa, b, h * (0.8 + y * 0.4), t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        const pop = Math.min(1, t * 8, (1 - t) * 10);
        return <Coin key={i} p={pos} r={[t * 9 + x * 6, t * 4, y * 3]} s={s * pop} />;
      })}
    </>
  );
};

/** A tidy pile of n coins in stacks (for the glass box). */
export const CoinStacks = ({ n, cols = 4, rows = 3, gap = 0.27, base = 0 }: { n: number; cols?: number; rows?: number; gap?: number; base?: number }) => {
  const k = Math.max(0, Math.round(n));
  const per = Math.ceil(k / (cols * rows)) || 1;
  return (
    <>
      {Array.from({ length: k }, (_, i) => {
        const s = i % (cols * rows);
        const lvl = Math.floor(i / (cols * rows));
        const cx = (s % cols) - (cols - 1) / 2;
        const cz = Math.floor(s / cols) - (rows - 1) / 2;
        const wob = Math.sin(i * 12.9898) * 0.012;
        return <Coin key={i} p={[cx * gap + wob, base + 0.016 + lvl * 0.03, cz * gap - wob]} r={[0, i, 0]} />;
      }).slice(0, per * cols * rows)}
    </>
  );
};

// ------------------------------------------------------------ the agent

export type RobotProps = { p: V3; ry?: number; badge?: string; eyes?: string; reach?: number; reachL?: number; blink?: number; f: number; s?: number; sad?: number; hover?: number };
export const Robot = ({ p, ry = 0, badge = K.mint, eyes = K.mint, reach = 0, reachL = 0, blink = 0, f, s = 1, sad = 0, hover = 1 }: RobotProps) => {
  const bob = Math.sin(f / 22) * 0.04 * hover;
  const tilt = Math.sin(f / 37) * 0.04;
  const eyeY = Math.max(0.08, 1 - blink);
  return (
    <group position={p} rotation={[0, ry, 0]} scale={s}>
      {/* hover pad and its glow */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow material={MAT.steelDark}>
        <cylinderGeometry args={[0.42, 0.48, 0.1, 48]} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.43, 0.018, 12, 64]} />
        {glow(badge, 2.4)}
      </mesh>
      <group position={[0, 0.02 + bob, 0]} rotation={[0, 0, tilt]}>
        {/* body */}
        <RoundedBox args={[0.8, 0.74, 0.62]} radius={0.22} smoothness={6} position={[0, 0.55, 0]} castShadow receiveShadow material={MAT.cream} />
        <mesh position={[0, 0.58, 0.315]}>
          <circleGeometry args={[0.1, 40]} />
          {glow(badge, 2.2)}
        </mesh>
        <mesh position={[0, 0.58, 0.31]}>
          <ringGeometry args={[0.11, 0.135, 48]} />
          <meshStandardMaterial color="#c4c9e0" metalness={1} roughness={0.25} />
        </mesh>
        {/* arms: pivot at the shoulder, reach forward */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.47, 0.78, 0]} rotation={[-(side < 0 ? reachL : reach) * 1.35, 0, side * (0.12 + 0.18 * (side < 0 ? reachL : reach))]}>
            <mesh position={[0, -0.2, 0]} castShadow material={MAT.cream}>
              <capsuleGeometry args={[0.085, 0.26, 8, 24]} />
            </mesh>
            <mesh position={[0, -0.4, 0]} material={MAT.chrome}>
              <sphereGeometry args={[0.07, 24, 16]} />
            </mesh>
          </group>
        ))}
        {/* neck and head */}
        <mesh position={[0, 0.97, 0]} material={MAT.chrome}>
          <cylinderGeometry args={[0.1, 0.13, 0.1, 32]} />
        </mesh>
        <group position={[0, 1.3, 0]} rotation={[sad * 0.25, 0, 0]}>
          <RoundedBox args={[0.86, 0.6, 0.64]} radius={0.22} smoothness={6} castShadow material={MAT.cream} />
          <RoundedBox args={[0.68, 0.42, 0.06]} radius={0.12} smoothness={4} position={[0, -0.01, 0.31]} material={MAT.face} />
          {[-0.15, 0.15].map((x) => (
            <mesh key={x} position={[x, 0.03 - sad * 0.03, 0.345]} scale={[1, eyeY, 1]}>
              <capsuleGeometry args={[0.052, 0.07, 6, 16]} />
              {glow(eyes, 3.2)}
            </mesh>
          ))}
          <mesh position={[0, -0.1 - sad * 0.02, 0.345]} rotation={[0, 0, sad > 0.5 ? 0 : Math.PI]}>
            <torusGeometry args={[0.07, 0.014, 8, 24, Math.PI]} />
            {glow(eyes, 2.4)}
          </mesh>
          {[-1, 1].map((x) => (
            <mesh key={x} position={[x * 0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.chrome}>
              <cylinderGeometry args={[0.1, 0.1, 0.08, 28]} />
            </mesh>
          ))}
          <mesh position={[0, 0.38, 0]} material={MAT.chrome}>
            <cylinderGeometry args={[0.014, 0.014, 0.22, 8]} />
          </mesh>
          <mesh position={[0, 0.51, 0]}>
            <sphereGeometry args={[0.06, 24, 16]} />
            {glow(K.amber, 3)}
          </mesh>
        </group>
      </group>
    </group>
  );
};

// ------------------------------------------------------------ the locked box (the drawer)

export type BoxProps = { p: V3; coins: number; light: string; locked?: number; lockColor?: string; f: number; open?: number; s?: number };
export const GlassBox = ({ p, coins, light, locked = 0, lockColor = K.mint, f, s = 1 }: BoxProps) => {
  const pulse = 2.6 + Math.sin(f / 9) * 0.6;
  return (
    <group position={p} scale={s}>
      <RoundedBox args={[1.56, 0.18, 1.24]} radius={0.06} smoothness={4} position={[0, 0.09, 0]} castShadow receiveShadow material={MAT.steel} />
      <group position={[0, 0.18, 0]}>
        <CoinStacks n={coins} />
      </group>
      <RoundedBox args={[1.36, 1.04, 1.04]} radius={0.07} smoothness={4} position={[0, 0.7, 0]} material={MAT.glass} />
      {/* frame posts and top rim */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
        <RoundedBox key={`${x}${z}`} args={[0.07, 1.06, 0.07]} radius={0.03} smoothness={3} position={[x * 0.67, 0.7, z * 0.51]} material={MAT.chrome} castShadow />
      ))}
      <RoundedBox args={[1.46, 0.08, 1.12]} radius={0.035} smoothness={3} position={[0, 1.24, 0]} material={MAT.chrome} castShadow />
      {/* status light */}
      <mesh position={[0, 1.31, 0]} material={MAT.steelDark}>
        <cylinderGeometry args={[0.16, 0.19, 0.07, 32]} />
      </mesh>
      <mesh position={[0, 1.34, 0]}>
        <sphereGeometry args={[0.13, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={light} emissive={light} emissiveIntensity={pulse} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.6, 0]} color={light} intensity={2.2} distance={3.2} decay={2} />
      {/* lock bars slide across the front when it locks */}
      {[0.38, 0.7, 1.02].map((y, i) => (
        <RoundedBox key={y} args={[1.42 * Math.max(0.001, locked), 0.07, 0.06]} radius={0.025} smoothness={3} position={[0, y, 0.56 + i * 0.001]} visible={locked > 0.01}>
          <meshStandardMaterial color="#e6e9f7" metalness={1} roughness={0.2} emissive={K.red} emissiveIntensity={locked * 0.5} />
        </RoundedBox>
      ))}
      {/* padlock */}
      <group position={[0, 0.66, 0.6]}>
        <RoundedBox args={[0.28, 0.22, 0.08]} radius={0.04} smoothness={3} material={MAT.chrome} castShadow />
        <mesh position={[0, 0.02, 0.045]}>
          <circleGeometry args={[0.045, 24]} />
          {glow(lockColor, 3)}
        </mesh>
        <mesh position={[0, 0.13 + (1 - locked) * 0.05, 0]}>
          <torusGeometry args={[0.085, 0.022, 12, 32, Math.PI]} />
          <meshStandardMaterial color="#d9def5" metalness={1} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
};

/** The spending tray in front of the box. `w` is its width (the limit), `n` coins on it. */
export const Tray = ({ p, w, n, edge = K.mint, edgeGlow = 1.6 }: { p: V3; w: number; n: number; edge?: string; edgeGlow?: number }) => {
  const k = Math.max(0, Math.round(n));
  const cols = Math.max(1, Math.floor((w - 0.12) / 0.26));
  return (
    <group position={p}>
      <RoundedBox args={[w, 0.07, 0.62]} radius={0.03} smoothness={3} position={[0, 0.035, 0]} castShadow receiveShadow material={MAT.steelDark} />
      <RoundedBox args={[w + 0.05, 0.03, 0.67]} radius={0.014} smoothness={2} position={[0, 0.075, 0]}>
        <meshStandardMaterial color={edge} emissive={edge} emissiveIntensity={edgeGlow} toneMapped={false} transparent opacity={0.9} />
      </RoundedBox>
      <RoundedBox args={[w - 0.04, 0.03, 0.56]} radius={0.014} smoothness={2} position={[0, 0.088, 0]} material={MAT.steel} />
      {Array.from({ length: k }, (_, i) => {
        const c = i % cols, r = Math.floor(i / cols) % 2, l = Math.floor(i / (cols * 2));
        return <Coin key={i} p={[(c - (cols - 1) / 2) * 0.26, 0.12 + l * 0.03, (r - 0.5) * 0.26]} r={[0, i * 0.7, 0]} />;
      })}
    </group>
  );
};

// ------------------------------------------------------------ the owner's safe

export const Safe = ({ p, glowAmt = 0.4, ry = 0, s = 1, f, shield = 0 }: { p: V3; glowAmt?: number; ry?: number; s?: number; f: number; shield?: number }) => (
  <group position={p} rotation={[0, ry, 0]} scale={s}>
    <RoundedBox args={[1.05, 1.1, 0.95]} radius={0.1} smoothness={4} position={[0, 0.62, 0]} castShadow receiveShadow material={MAT.steel} />
    <RoundedBox args={[0.86, 0.9, 0.06]} radius={0.06} smoothness={3} position={[0, 0.62, 0.48]} material={MAT.steelDark} castShadow />
    <mesh position={[0, 0.62, 0.53]} rotation={[Math.PI / 2, 0, f / 40]} material={MAT.chrome}>
      <cylinderGeometry args={[0.17, 0.17, 0.05, 40]} />
    </mesh>
    <mesh position={[0, 0.62, 0.53]}>
      <torusGeometry args={[0.22, 0.02, 12, 48]} />
      <meshStandardMaterial color={K.mint} emissive={K.mint} emissiveIntensity={0.6 + glowAmt * 3.4} toneMapped={false} />
    </mesh>
    {[0, 1, 2].map((i) => (
      <mesh key={i} position={[0, 0.62, 0.57]} rotation={[0, 0, (i * Math.PI) / 3 + f / 40]} material={MAT.chrome}>
        <boxGeometry args={[0.5, 0.035, 0.035]} />
      </mesh>
    ))}
    {/* coin slot on top */}
    <RoundedBox args={[0.42, 0.04, 0.1]} radius={0.015} smoothness={2} position={[0, 1.18, 0]}>
      <meshStandardMaterial color={K.mint} emissive={K.mint} emissiveIntensity={0.8 + glowAmt * 3} toneMapped={false} />
    </RoundedBox>
    {[-1, 1].map((x) => [-1, 1].map((z) => (
      <mesh key={`${x}${z}`} position={[x * 0.4, 0.035, z * 0.35]} material={MAT.chrome}>
        <cylinderGeometry args={[0.06, 0.07, 0.07, 16]} />
      </mesh>
    )))}
    <pointLight position={[0, 0.7, 0.9]} color={K.mint} intensity={glowAmt * 3} distance={2.5} />
    {shield > 0.01 && (
      <>
        <mesh position={[0, 0.6, 0]} scale={0.85 + 0.15 * shield}>
          <sphereGeometry args={[1.05, 48, 32]} />
          <meshStandardMaterial color={K.red} emissive={K.red} emissiveIntensity={1.4} transparent opacity={0.16 * shield} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.6, 0]} scale={0.86 + 0.15 * shield}>
          <sphereGeometry args={[1.05, 20, 12]} />
          <meshStandardMaterial color={K.red} emissive={K.red} emissiveIntensity={2.2} transparent opacity={0.35 * shield} wireframe depthWrite={false} toneMapped={false} />
        </mesh>
      </>
    )}
  </group>
);

// ------------------------------------------------------------ the fixed limit: an open bowl

export const Bowl = ({ p, fill, s = 1, rim = K.red }: { p: V3; fill: number; s?: number; rim?: string }) => {
  const coins = useMemo(() => {
    const g = rng(42);
    return Array.from({ length: 90 }, (_, i) => {
      const a = g() * Math.PI * 2, r = Math.sqrt(g()) * 0.78;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, k: i / 90, rx: (g() - 0.5) * 0.8, rz: (g() - 0.5) * 0.8, ry: g() * 6 };
    });
  }, []);
  return (
    <group position={p} scale={s}>
      <mesh geometry={BOWL_GEO} castShadow receiveShadow>
        <meshPhysicalMaterial color="#c9cfe8" metalness={1} roughness={0.22} side={THREE.DoubleSide} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.99, 0.02, 12, 64]} />
        {glow(rim, 1.8)}
      </mesh>
      {coins.map((c, i) => {
        if (c.k >= fill) return null;
        const r = Math.hypot(c.x, c.z);
        const y = 0.12 + (1 - r / 0.8) * 0.28 * fill + c.k * 0.06;
        return <Coin key={i} p={[c.x, y, c.z]} r={[c.rx, c.ry, c.rz]} />;
      })}
    </group>
  );
};

// ------------------------------------------------------------ people and things

const SHIRTS = ["#7aa2ff", "#ff9fb8", "#9be7ff", "#c3a6ff", "#ffd08a", "#8ff0c8"];
export const Person = ({ p, ry = 0, color = 0, f, walk = 0, fade = 1, sad = 0 }: { p: V3; ry?: number; color?: number; f: number; walk?: number; fade?: number; sad?: number }) => {
  if (fade <= 0.01) return null;
  const step = Math.sin(f / 5 + color) * walk;
  const shirt = sad > 0.5 ? "#59607e" : SHIRTS[color % SHIRTS.length];
  return (
    <group position={[p[0], p[1] + Math.abs(step) * 0.06, p[2]]} rotation={[0, ry, step * 0.06]} scale={fade}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.42, 8, 24]} />
        <meshPhysicalMaterial color={shirt} roughness={0.5} clearcoat={0.5} />
      </mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <sphereGeometry args={[0.19, 32, 24]} />
        <meshPhysicalMaterial color="#f3d2b6" roughness={0.55} clearcoat={0.3} />
      </mesh>
      {[-0.07, 0.07].map((x) => (
        <mesh key={x} position={[x, 1.1 - sad * 0.02, 0.17]}>
          <sphereGeometry args={[0.022, 12, 8]} />
          <meshStandardMaterial color="#1b2140" />
        </mesh>
      ))}
    </group>
  );
};

export const Thief = ({ p, ry = 0, s = 1, f, keyGlow = 1, fade = 1 }: { p: V3; ry?: number; s?: number; f: number; keyGlow?: number; fade?: number }) => {
  if (fade <= 0.01) return null;
  const sway = Math.sin(f / 18) * 0.05;
  return (
    <group position={p} rotation={[0, ry, sway]} scale={s * fade}>
      <mesh position={[0, 0.62, 0]} castShadow material={MAT.thief}>
        <capsuleGeometry args={[0.3, 0.6, 8, 24]} />
      </mesh>
      <mesh position={[0, 1.32, 0]} scale={[1, 1.12, 1]} castShadow material={MAT.thief}>
        <sphereGeometry args={[0.3, 32, 24]} />
      </mesh>
      <mesh position={[0, 1.3, 0.16]} scale={[1, 0.9, 0.6]}>
        <sphereGeometry args={[0.21, 32, 24]} />
        <meshStandardMaterial color="#020308" roughness={1} />
      </mesh>
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, 1.33, 0.29]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          {glow(K.red, 5)}
        </mesh>
      ))}
      <Key p={[0.42, 0.85, 0.25]} f={f} glowAmt={keyGlow} />
    </group>
  );
};

export const Key = ({ p, f, glowAmt = 1, s = 1 }: { p: V3; f: number; glowAmt?: number; s?: number }) => (
  <group position={p} rotation={[0.3, f / 30, 0.4]} scale={s}>
    <mesh>
      <torusGeometry args={[0.09, 0.028, 12, 32]} />
      {glow(K.red, 1 + 3 * glowAmt)}
    </mesh>
    <mesh position={[0.2, 0, 0]}>
      <boxGeometry args={[0.24, 0.04, 0.04]} />
      {glow(K.red, 1 + 3 * glowAmt)}
    </mesh>
    {[0.24, 0.3].map((x) => (
      <mesh key={x} position={[x, -0.045, 0]}>
        <boxGeometry args={[0.03, 0.07, 0.04]} />
        {glow(K.red, 1 + 3 * glowAmt)}
      </mesh>
    ))}
    <pointLight color={K.red} intensity={1.5 * glowAmt} distance={1.6} />
  </group>
);

export const Supplier = ({ p, ry = 0, s = 1 }: { p: V3; ry?: number; s?: number }) => (
  <group position={p} rotation={[0, ry, 0]} scale={s}>
    {[[0, 0, 0, 0.55], [0.52, 0, 0.1, 0.48], [0.22, 0.55, 0.03, 0.48]].map(([x, y, z, a], i) => (
      <group key={i} position={[x, y + a / 2, z]} rotation={[0, i * 0.3, 0]}>
        <RoundedBox args={[a, a, a]} radius={0.04} smoothness={3} castShadow receiveShadow material={MAT.crate} />
        <RoundedBox args={[a + 0.02, 0.06, a + 0.02]} radius={0.02} smoothness={2} position={[0, a / 2 - 0.03, 0]} material={MAT.crateLid} />
        <RoundedBox args={[a + 0.015, 0.06, a + 0.015]} radius={0.02} smoothness={2} position={[0, -a / 2 + 0.08, 0]} material={MAT.crateLid} />
      </group>
    ))}
  </group>
);

/** What an agent buys: data (a glowing cube), tools (a gear), help from another agent (a small bot head). */
export const Goods = ({ kind, p, s = 1, f }: { kind: "data" | "tools" | "agent"; p: V3; s?: number; f: number }) => {
  if (s <= 0.001) return null;
  const spin = f / 40;
  if (kind === "data")
    return (
      <group position={p} rotation={[spin, spin * 1.3, 0]} scale={s}>
        <RoundedBox args={[0.34, 0.34, 0.34]} radius={0.05} smoothness={3}>
          <meshPhysicalMaterial color={K.sky} transmission={0.6} roughness={0.1} thickness={0.3} emissive={K.sky} emissiveIntensity={0.6} />
        </RoundedBox>
        <mesh>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          {glow(K.sky, 4)}
        </mesh>
      </group>
    );
  if (kind === "tools")
    return (
      <group position={p} rotation={[Math.PI / 2, 0, spin]} scale={s}>
        <mesh>
          <cylinderGeometry args={[0.17, 0.17, 0.09, 32]} />
          <meshStandardMaterial color={K.amber} metalness={0.8} roughness={0.3} emissive={K.amber} emissiveIntensity={0.5} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 4, 0]} position={[Math.cos((i * Math.PI) / 4) * 0.2, 0, -Math.sin((i * Math.PI) / 4) * 0.2]}>
            <boxGeometry args={[0.09, 0.09, 0.08]} />
            <meshStandardMaterial color={K.amber} metalness={0.8} roughness={0.3} emissive={K.amber} emissiveIntensity={0.5} />
          </mesh>
        ))}
        <mesh>
          <cylinderGeometry args={[0.06, 0.06, 0.11, 24]} />
          {glow(K.ink, 2)}
        </mesh>
      </group>
    );
  return (
    <group position={p} rotation={[0, Math.sin(spin) * 0.6, 0]} scale={s}>
      <RoundedBox args={[0.42, 0.3, 0.3]} radius={0.1} smoothness={4} material={MAT.cream} />
      <RoundedBox args={[0.34, 0.2, 0.03]} radius={0.06} smoothness={3} position={[0, 0, 0.15]} material={MAT.face} />
      {[-0.07, 0.07].map((x) => (
        <mesh key={x} position={[x, 0.01, 0.17]}>
          <capsuleGeometry args={[0.025, 0.035, 4, 12]} />
          {glow(K.violet, 3)}
        </mesh>
      ))}
    </group>
  );
};

// ------------------------------------------------------------ the stage

export const Pedestal = ({ p, r = 3.3, rim = K.mint, rimGlow = 1.4, s = 1 }: { p: V3; r?: number; rim?: string; rimGlow?: number; s?: number }) => (
  <group position={p} scale={s}>
    <mesh position={[0, -0.22, 0]} castShadow receiveShadow material={MAT.deck}>
      <cylinderGeometry args={[r, r * 1.04, 0.44, 96]} />
    </mesh>
    <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={MAT.deckTop}>
      <circleGeometry args={[r - 0.06, 96]} />
    </mesh>
    <mesh position={[0, 0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[r - 0.03, 0.022, 12, 128]} />
      {glow(rim, rimGlow)}
    </mesh>
    {[0.42, 0.7].map((k) => (
      <mesh key={k} position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * k, r * k + 0.012, 128]} />
        <meshStandardMaterial color={rim} emissive={rim} emissiveIntensity={0.25} transparent opacity={0.35} toneMapped={false} />
      </mesh>
    ))}
  </group>
);

export const Floor = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.44, 0]} receiveShadow material={MAT.floor}>
    <circleGeometry args={[260, 128]} />
  </mesh>
);

/** A link of blocks sliding along x: the blockchain behind the duel. */
export const Chain = ({ p, f, n = 14, gap = 1.5, speed = 0.012, fade = 1 }: { p: V3; f: number; n?: number; gap?: number; speed?: number; fade?: number }) => {
  if (fade <= 0.01) return null;
  const off = (f * speed) % gap;
  return (
    <group position={p} scale={fade}>
      {Array.from({ length: n }, (_, i) => {
        const x = (i - n / 2) * gap + off;
        const fresh = i === n - 1 ? Math.min(1, off / (gap * 0.5)) : 1;
        return (
          <group key={i} position={[x, 0, 0]}>
            <RoundedBox args={[0.7, 0.7, 0.7]} radius={0.08} smoothness={3} scale={fresh}>
              <meshPhysicalMaterial color="#c9c0ff" transmission={0.92} thickness={0.6} roughness={0.12} ior={1.4} clearcoat={1} attenuationColor="#6a5cff" attenuationDistance={0.9} />
            </RoundedBox>
            <mesh scale={fresh * (0.9 + 0.1 * Math.sin(f / 14 + i))} rotation={[f / 90 + i, f / 70, 0]}>
              <octahedronGeometry args={[0.2, 0]} />
              {glow(K.violet, 3.2)}
            </mesh>
            <mesh scale={fresh}>
              <boxGeometry args={[0.74, 0.035, 0.74]} />
              {glow("#b3a8ff", 1.2)}
            </mesh>
            {i < n - 1 && (
              <mesh position={[gap / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.025, 0.025, gap - 0.7, 8]} />
                {glow(K.violet, 1.2)}
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
};

/** Small kibble pieces for the title: rounded amber pellets. */
export const PELLET_GEO = (() => {
  // a chunky ring of kibble
  const g = new THREE.TorusGeometry(0.075, 0.048, 20, 36);
  g.scale(1, 1, 0.8);
  return g;
})();
export const PELLET_MAT = new THREE.MeshPhysicalMaterial({ color: "#b8682a", roughness: 0.72, clearcoat: 0.25, clearcoatRoughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color("#ffc27a"), bumpScale: 0.02 });
