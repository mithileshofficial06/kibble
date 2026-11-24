import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Atmos } from "./components/Atmos";
import { GrainField, Grain, PX, rng, sampleText } from "./components/Grains";
import { SANS } from "./theme";
import { FPS } from "./tl";

export const Test: React.FC = () => {
  const frame = useCurrentFrame();
  const grains = useMemo(() => {
    const r = rng(7);
    const pts = sampleText("kibble.", `600 340px ${SANS}`, 7);
    return pts.map(([x, y]): Grain => ({
      from: [x * PX + (r() - 0.5) * 2, 3.5 + r() * 2, (r() - 0.5) * 3],
      to: [x * PX, -y * PX, (r() - 0.5) * 0.15],
      delay: 0.2 + r() * 1.4 + (x + 900) / 1800,
      size: 0.024 + r() * 0.012,
      hue: r(),
      seed: r(),
    }));
  }, []);
  return (
    <AbsoluteFill style={{ background: "#100c14" }}>
      <Atmos mood={() => ({ a: "#ffb000", b: "#ff4d3d", i: 1 })} />
      <GrainField grains={grains} t={frame / FPS} focus={10} rotY={Math.sin(frame / 200) * 0.15} />
    </AbsoluteFill>
  );
};
