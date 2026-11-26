import { Composition } from "remotion";
import { Test } from "./Test";
import { Film } from "./film/Film";
import { TOTAL as FILM_TOTAL, FPS as FILM_FPS } from "./film/tl";
import { Video } from "./Video";
import { FPS, TOTAL } from "./tl";
import { H, W } from "./theme";

export const Root: React.FC = () => (
  <>
    <Composition id="Kibble" component={Video} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{ audio: true }} />
    <Composition id="KibbleSilent" component={Video} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{ audio: false }} />
    <Composition id="Film" component={Film} durationInFrames={FILM_TOTAL} fps={FILM_FPS} width={W} height={H} defaultProps={{ audio: "mix" as const }} />
    <Composition id="FilmVO" component={Film} durationInFrames={FILM_TOTAL} fps={FILM_FPS} width={W} height={H} defaultProps={{ audio: "vo" as const }} />
    <Composition id="FilmSilent" component={Film} durationInFrames={FILM_TOTAL} fps={FILM_FPS} width={W} height={H} defaultProps={{ audio: "none" as const }} />
    <Composition id="FilmStill" component={Film} durationInFrames={FILM_TOTAL} fps={FILM_FPS} width={W} height={H} defaultProps={{ audio: "none" as const, clean: true }} />
    <Composition id="Test" component={Test} durationInFrames={300} fps={FPS} width={W} height={H} />
  </>
);
