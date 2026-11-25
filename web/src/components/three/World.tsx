"use client";

import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COL, Island } from "./Island";
import { PinDriver, PinLayer } from "./Pins";
import type { Shot, Stage } from "./stage";

const X = 4.7;
type Cam = { p: [number, number, number]; l: [number, number, number] };
/** Where the camera stands and what it looks at, for a wide screen. */
const SHOTS: Record<Shot, Cam> = {
  open: { p: [0, 6.2, 19], l: [0, 1.4, 0] },
  agent: { p: [X - 3.4, 2.7, 5.6], l: [X - 1.0, 1.65, 0.6] },
  guess: { p: [-X + 2.1, 3.3, 7.6], l: [-X, 1.15, 0.2] },
  box: { p: [X - 1.2, 2.7, 6.6], l: [X - 0.2, 1.05, 0] },
  sale: { p: [X + 0.3, 4.4, 9.4], l: [X - 0.05, 1.05, -0.1] },
  vault: { p: [X + 5.2, 2.7, 8.0], l: [X + 1.35, 1.1, 0.5] },
  limit: { p: [X - 1.9, 2.4, 5.7], l: [X - 0.1, 1.0, 0] },
  both: { p: [0.35, 5.1, 15.6], l: [0.35, 0.75, 0] },
  fixed: { p: [-X - 1.0, 4.0, 10.0], l: [-X, 0.85, 0.2] },
  kibble: { p: [X + 0.9, 4.0, 10.2], l: [X + 0.1, 0.85, 0.2] },
  thief: { p: [X - 1.2, 1.75, 8.0], l: [X - 1.9, 1.25, 1.6] },
  locked: { p: [X + 0.9, 2.5, 7.2], l: [X - 0.05, 0.95, 0] },
  keys: { p: [X + 0.5, 2.0, 6.4], l: [X, 0.95, 0.4] },
  end: { p: [X - 0.6, 2.3, 10.5], l: [X, 3.35, 0] },
};

function Rig({ stage }: { stage: Stage }) {
  const { camera, size } = useThree();
  const look = useRef(new THREE.Vector3(0, 1.2, 0));
  const side = useRef<"fixed" | "kibble">("kibble");
  const since = useRef(0);
  const first = useRef(true);
  const want = useMemo(() => new THREE.Vector3(), []);
  const wantLook = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }, dt) => {
    const aspect = size.width / size.height;
    let shot = stage.shot;
    // a narrow screen can't hold both sides: follow the action instead
    if (aspect < 1.15 && shot === "both") {
      since.current += dt;
      if (stage.follow !== side.current && since.current > 1.5) {
        side.current = stage.follow;
        since.current = 0;
      }
      shot = side.current;
    }
    const s = SHOTS[shot];
    const t = clock.elapsedTime;
    const far = aspect < 1.15 ? 1.15 + (1.15 - aspect) * 1.35 : aspect < 1.5 && shot === "both" ? 1.5 / aspect : aspect > 1.95 && shot === "both" ? 0.84 : 1;
    wantLook.set(...s.l);
    want.set(...s.p).sub(wantLook).multiplyScalar(far);
    // never quite still
    want.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.19) * 0.07);
    want.y += Math.sin(t * 0.27) * 0.14;
    want.add(wantLook);
    const k = first.current ? 1 : 1 - Math.exp(-Math.min(dt, 0.05) * 1.35);
    first.current = false;
    camera.position.lerp(want, k);
    look.current.lerp(wantLook, k * 1.15 > 1 ? 1 : k * 1.15);
    camera.lookAt(look.current);
  });
  return null;
}

/** Slow dust, so the air has depth. */
function Dust({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * 30;
      a[i * 3 + 1] = Math.random() * 10;
      a[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    return g;
  }, [count]);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.012;
      ref.current.position.y = Math.sin(clock.elapsedTime * 0.15) * 0.3;
    }
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.035} color={COL.saffron} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/** Tells the page when the scene has really been drawn (shaders built), so nothing starts on a black frame. */
function Ready({ onReady }: { onReady?: () => void }) {
  const n = useRef(0);
  const calm = useRef(0);
  const told = useRef(false);
  useFrame((_, dt) => {
    n.current++;
    // the first frames build shaders and stall: wait for a steady run of them
    calm.current = dt < 0.09 ? calm.current + 1 : 0;
    if (!told.current && n.current > 20 && (calm.current > 14 || n.current > 240)) {
      told.current = true;
      onReady?.();
    }
  });
  return null;
}

export default function World({ stage, onReady }: { stage: Stage; onReady?: () => void }) {
  const layer = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [tier, setTier] = useState<"mid" | "low">("mid");
  const dpr: [number, number] = tier === "mid" ? [1, 1.2] : [0.75, 1];
  return (
    <div className={`film-world ${shown ? "ready" : ""}`} aria-hidden="true" data-tier={tier}>
      <Canvas
        dpr={dpr}
        camera={{ fov: 36, near: 0.1, far: 80, position: SHOTS.open.p }}
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <PerformanceMonitor bounds={() => [20, 58]} iterations={20} threshold={0.9} onDecline={() => setTier("low")} flipflops={3} />
        <color attach="background" args={["#0d0911"]} />
        <fog attach="fog" args={["#0d0911", 18, 44]} />
        <ambientLight intensity={0.5} color="#c3b2e0" />
        <hemisphereLight args={["#ffe6c2", "#1b1028", 0.45]} />
        <directionalLight position={[0, 9, -10]} intensity={0.7} color="#8a5bd6" />
        <pointLight position={[0, 3.2, -7]} intensity={34} distance={18} color="#6a2f9e" />
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={3.2} position={[0, 6, 4]} scale={[14, 3, 1]} color="#ffe2b0" />
          <Lightformer intensity={1.6} position={[0, 3, 9]} rotation={[0, Math.PI, 0]} scale={[16, 3, 1]} color="#f4ecff" />
          <Lightformer intensity={2.2} position={[-7, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[8, 3, 1]} color="#9d7bff" />
          <Lightformer intensity={2.2} position={[7, 2, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[8, 3, 1]} color="#ffb000" />
          <Lightformer intensity={0.5} position={[0, 1, -8]} scale={[14, 4, 1]} color="#4b2a75" />
        </Environment>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[90, 90]} />
          <meshStandardMaterial color="#150e1b" roughness={0.42} metalness={0.55} envMapIntensity={0.5} />
        </mesh>
        <Island stage={stage} side="fixed" x={-X} />
        <Island stage={stage} side="kibble" x={X} />
        <Dust count={tier === "low" ? 120 : 420} />
        <Rig stage={stage} />
        <PinDriver stage={stage} layer={layer} />
        <Ready
          onReady={() => {
            setShown(true);
            onReady?.();
          }}
        />
        {tier !== "low" && (
          <EffectComposer multisampling={2}>
            <Bloom mipmapBlur intensity={1.05} luminanceThreshold={0.72} luminanceSmoothing={0.25} radius={0.72} />
            <Noise opacity={0.028} />
            <Vignette eskil={false} offset={0.22} darkness={0.78} />
          </EffectComposer>
        )}
      </Canvas>
      <PinLayer stage={stage} layer={layer} />
    </div>
  );
}
