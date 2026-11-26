import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { project } from "./director";
import { SCREENS, screenPose } from "./World";
import { at, end } from "./tl";

/** The real recordings, mapped onto the 3D screens' corners with a CSS homography (crisp, and frame-exact). */

const VW = 1920, VH = 1080;

/** matrix3d that maps the rectangle (0,0)-(w,h) onto four points (clockwise from top-left). */
function homography(w: number, h: number, q: { x: number; y: number }[]) {
  const [p0, p1, p2, p3] = q;
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A: number[][] = [], B: number[] = [];
  const dst = [p0, p1, p2, p3];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }
  // Gaussian elimination
  for (let c = 0; c < 8; c++) {
    let m = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]];
    [B[c], B[m]] = [B[m], B[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j < 8; j++) A[r][j] -= k * A[c][j];
      B[r] -= k * B[c];
    }
  }
  const [a, b, c, d, e, f, g, hh] = B.map((v, i) => v / A[i][i]);
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
}

export const ScreenVideos = () => {
  const f = useCurrentFrame();
  const from = at("real", -1);
  if (f < from || f >= end("real") + 2) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {SCREENS.map((sc, i) => {
        const q = screenPose(f, i);
        if (q.rise <= 0) return null;
        const c = Math.cos(q.ry), s = Math.sin(q.ry);
        const corner = (lx: number, ly: number) => {
          const x = lx * q.s, y = ly * q.s, z = 0.066 * q.s;
          return project(f, [q.pos[0] + x * c + z * s, q.pos[1] + y, q.pos[2] - x * s + z * c]);
        };
        const pts = [corner(-2.4, 1.35), corner(2.4, 1.35), corner(2.4, -1.35), corner(-2.4, -1.35)];
        return (
          <div key={i} style={{ position: "absolute", left: 0, top: 0, width: VW, height: VH, transformOrigin: "0 0", transform: homography(VW, VH, pts), opacity: Math.min(1, q.rise * 1.4) }}>
            <Sequence from={from} layout="none">
              <OffthreadVideo src={staticFile(sc.src)} muted style={{ width: VW, height: VH, display: "block" }} />
            </Sequence>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
