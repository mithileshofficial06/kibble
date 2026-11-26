import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import { continueRender, delayRender, useCurrentFrame } from "remotion";
import * as THREE from "three";
import { Floor } from "./assets";
import { CH, DUEL, camAt, inCh } from "./director";
import { SetDuel, SetOne, SetReveal, SetShop } from "./sets";
import { H, K, W } from "./theme";
import { at, end, p } from "./tl";

/** The 3D picture: one canvas for the whole film, studio light, glow, depth of field. */

const Rig = ({ f, focus }: { f: number; focus: THREE.Vector3 }) => {
  const { camera } = useThree();
  const c = camAt(f);
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.set(...c.pos);
  cam.fov = c.fov;
  cam.near = 0.1;
  cam.far = 500;
  cam.updateProjectionMatrix();
  cam.lookAt(...c.tgt);
  focus.set(...c.tgt);
  return null;
};

/** The composer builds its passes one render after mount; hold the first frame until it can draw. */
const ComposerGate = ({ composer }: { composer: React.RefObject<{ passes?: unknown[] } | null> }) => {
  const { advance } = useThree();
  const [handle] = useState(() => delayRender("effects composer"));
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const c = composer.current;
      if (c && (c.passes?.length ?? 0) > 1) {
        advance(performance.now());
        requestAnimationFrame(() => continueRender(handle));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [advance, composer, handle]);
  return null;
};

const FOG = "#0a1029";
const SKY = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: { fogc: { value: new THREE.Color(FOG) }, top: { value: new THREE.Color("#03050c") }, mid: { value: new THREE.Color("#0d1534") }, glow: { value: new THREE.Color("#251d58") } },
  vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader:
    "uniform vec3 fogc; uniform vec3 top; uniform vec3 mid; uniform vec3 glow; varying vec3 vP; void main(){ float y = vP.y; vec3 c = mix(fogc, glow, smoothstep(0.0, 0.09, y)); c = mix(c, mid, smoothstep(0.09, 0.3, y)); c = mix(c, top, smoothstep(0.3, 0.75, y)); gl_FragColor = vec4(c, 1.0); }",
});

/** Where each screen floats (shared with the video layer drawn over the canvas). */
export const SCREENS = [
  { x: -2.75, ry: 0.16, k: 0, src: "film/clips/play.mp4" },
  { x: 2.75, ry: -0.16, k: 1, src: "film/clips/drawer.mp4" },
];
export const screenPose = (f: number, i: number) => {
  const rise = p(f, at("real", -0.6), at("real", 1.0));
  const sc = SCREENS[i];
  return { rise, pos: [DUEL.screens[0] + sc.x, DUEL.screens[1] + (1 - rise) * -1.5 + Math.sin(f / 50 + sc.k) * 0.06, DUEL.screens[2]] as [number, number, number], ry: sc.ry, s: 0.6 + 0.4 * rise };
};

/** Floating monitors for the real recordings (the video itself is laid over them in 2D, see ScreenVideos). */
export const Screens = ({ f }: { f: number }) => {
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0a0f22", roughness: 0.3, metalness: 0.6 }), []);
  if (screenPose(f, 0).rise <= 0) return null;
  return (
    <>
      {SCREENS.map((_, i) => {
        const q = screenPose(f, i);
        return (
          <group key={i} position={q.pos} rotation={[0, q.ry, 0]} scale={q.s}>
            <RoundedBox args={[5.0, 2.95, 0.12]} radius={0.12} smoothness={4} material={glass} castShadow />
            <mesh position={[0, 0, 0.065]}>
              <planeGeometry args={[4.8, 2.7]} />
              <meshStandardMaterial color="#05070f" />
            </mesh>
            <mesh position={[0, -1.56, 0]}>
              <boxGeometry args={[4.9, 0.03, 0.03]} />
              <meshStandardMaterial color={K.mint} emissive={K.mint} emissiveIntensity={2.4} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
};

export const World = () => {
  const f = useCurrentFrame();
  const focus = useMemo(() => new THREE.Vector3(), []);
  const composer = useRef<{ passes?: unknown[] } | null>(null);
  const reveal = inCh(f, "reveal");
  const bokeh = reveal ? 7 : f >= at("proof") && f < end("proof") ? 4 : 1.6;
  const wide = inCh(f, "duel") || inCh(f, "one");
  return (
    <ThreeCanvas
      width={W}
      height={H}
      shadows
      style={{ position: "absolute", inset: 0 }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false, preserveDrawingBuffer: true }}
      camera={{ fov: 35, position: [0, 2, 8], near: 0.1, far: 500 }}
    >
      <Rig f={f} focus={focus} />
      <color attach="background" args={[FOG]} />
      <fog attach="fog" args={[FOG, wide ? 22 : 14, wide ? 60 : 42]} />
      <mesh material={SKY} scale={300}>
        <sphereGeometry args={[1, 48, 24]} />
      </mesh>
      <Environment resolution={512} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 6, 6]} scale={[10, 4, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.6} color="#bfe8ff" position={[-8, 3, 0]} scale={[4, 8, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.3} color="#b9a8ff" position={[8, 3, -2]} scale={[4, 8, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.1} color={K.mint} position={[0, 8, -6]} scale={3} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.6} color="#ffcf8a" position={[0, -4, 4]} scale={[12, 2, 1]} target={[0, 0, 0]} />
      </Environment>
      <hemisphereLight args={["#5a6cb8", "#070a18", 0.35]} />
      <directionalLight
        position={[6, 11, 7]}
        intensity={2.3}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-radius={6}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
      <directionalLight position={[-7, 5, -9]} intensity={1.4} color="#8f86ff" />
      <directionalLight position={[8, 3, -6]} intensity={0.45} color="#5cf0c0" />
      {inCh(f, "one") && <spotLight position={[0, 7, 3]} angle={0.45} penumbra={0.9} intensity={60 * p(f, 20, 100)} color="#fff1d6" distance={18} decay={1.6} />}
      <Floor />
      {inCh(f, "one") && f < CH.one[1] && <SetOne f={f} />}
      {reveal && f >= CH.reveal[0] && f < CH.reveal[1] && <SetReveal f={f} />}
      {f >= CH.shop[0] && f < CH.shop[1] && <SetShop f={f} />}
      {f >= CH.duel[0] && f < CH.duel[1] && <SetDuel f={f} />}
      {f >= CH.duel[0] && f < CH.duel[1] && <Screens f={f} />}
      {f >= CH.end[0] && <SetShop f={f} mode="end" />}
      <ComposerGate composer={composer} />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <EffectComposer ref={composer as any} multisampling={4} enableNormalPass={false}>
        <N8AO aoRadius={0.7} distanceFalloff={0.6} intensity={2.2} quality="high" halfRes={false} color="#02030a" />
        <DepthOfField target={focus} worldFocusRange={reveal ? 1.2 : 4.5} bokehScale={bokeh} />
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.95} luminanceSmoothing={0.25} radius={0.7} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <Vignette offset={0.28} darkness={0.62} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.18} />
      </EffectComposer>
    </ThreeCanvas>
  );
};
