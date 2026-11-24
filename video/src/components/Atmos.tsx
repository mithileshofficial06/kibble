import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import * as THREE from "three";
import { FPS } from "../tl";
import { H, W } from "../theme";

const frag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uT; uniform vec3 uA; uniform vec3 uB; uniform float uI; uniform vec2 uRes; uniform float uDim;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
void main(){
  vec2 p = (vUv - .5) * vec2(uRes.x/uRes.y, 1.);
  float n = fbm(p*1.6 + vec2(uT*.035, -uT*.022));
  vec2 g1 = vec2(-.62 + .10*sin(uT*.11), .22 + .07*cos(uT*.13));
  vec2 g2 = vec2(.66 + .08*cos(uT*.09), -.30 + .07*sin(uT*.12));
  float a = exp(-dot(p-g1,p-g1)*2.0) * (.55 + .6*n);
  float b = exp(-dot(p-g2,p-g2)*2.6) * (.55 + .6*n);
  vec3 bg = vec3(16., 12., 20.)/255.;
  vec3 col = bg + uA*a*.15*uI + uB*b*.10*uI;
  col += vec3(.012,.008,.016)*n;
  col *= 1. - .42*smoothstep(.35, 1.15, length(p));
  col *= uDim;
  float gr = hash(vUv*uRes + fract(uT*7.31)*91.7) - .5;
  col += gr * .014;
  gl_FragColor = vec4(col, 1.);
}`;
const vert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

export type Mood = { a: string; b: string; i: number; dim?: number };

/** The living background: two slow glows over plum-black, a vignette and a fine film grain. GPU shader. */
export const Atmos: React.FC<{ mood: (frame: number) => Mood }> = ({ mood }) => {
  const frame = useCurrentFrame();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        depthTest: false,
        uniforms: {
          uT: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() },
          uI: { value: 1 }, uRes: { value: new THREE.Vector2(W, H) }, uDim: { value: 1 },
        },
      }),
    [],
  );
  const m = mood(frame);
  mat.uniforms.uT.value = frame / FPS;
  (mat.uniforms.uA.value as THREE.Color).set(m.a);
  (mat.uniforms.uB.value as THREE.Color).set(m.b);
  mat.uniforms.uI.value = m.i;
  mat.uniforms.uDim.value = m.dim ?? 1;
  return (
    <ThreeCanvas linear flat width={W} height={H} style={{ position: "absolute", inset: 0 }} gl={{ antialias: false }}>
      <mesh frustumCulled={false} material={mat}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </ThreeCanvas>
  );
};
