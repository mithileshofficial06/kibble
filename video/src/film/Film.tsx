import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Overlay } from "./Overlay";
import { ScreenVideos } from "./ScreenVideos";
import { World } from "./World";
import { K } from "./theme";
import { SCENES } from "./tl";

/** The 3D film. Audio: the final mix when it exists, otherwise the narration scene by scene. */
export const Film: React.FC<{ audio: "mix" | "vo" | "none"; clean?: boolean }> = ({ audio, clean }) => (
  <AbsoluteFill style={{ background: K.night }}>
    <World />
    <ScreenVideos />
    <Overlay captions={!clean} />
    {audio === "mix" && <Audio src={staticFile("film/mix.wav")} />}
    {audio === "vo" &&
      SCENES.map((s) => (
        <Sequence key={s.id} from={s.from + s.lead} durationInFrames={s.voFrames + 10} name={`vo ${s.id}`}>
          <Audio src={staticFile(`film/vo/${s.id}.mp3`)} />
        </Sequence>
      ))}
  </AbsoluteFill>
);
