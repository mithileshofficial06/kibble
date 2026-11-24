import { Composition } from "remotion";
import { Test } from "./Test";
import { Video } from "./Video";
import { FPS, TOTAL } from "./tl";
import { H, W } from "./theme";

export const Root: React.FC = () => (
  <>
    <Composition id="Kibble" component={Video} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{ audio: true }} />
    <Composition id="KibbleSilent" component={Video} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{ audio: false }} />
    <Composition id="Test" component={Test} durationInFrames={300} fps={FPS} width={W} height={H} />
  </>
);
