import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Atmos, Mood } from "./components/Atmos";
import { Captions, Chrome, PourWipe } from "./components/ui";
import { Brakes, Machine, MACHINE_FRAMES, OneNumber } from "./scenes/Idea";
import { Bad, Hijack, LiveDesk, Playground, Receipts, Sales } from "./scenes/Live";
import { Close, Proof } from "./scenes/Outro";
import { Guess, Hook, Reveal, Three, Wallet } from "./scenes/Problem";
import { C } from "./theme";
import { lerp, prog, scene, SCENES } from "./tl";

const MOODS: Record<string, Mood> = {
  hook: { a: C.saffron, b: "#5b2a6e", i: 0.6 },
  guess: { a: C.saffron, b: "#5b2a6e", i: 0.7 },
  three: { a: C.coral, b: C.saffron, i: 0.8 },
  wallet: { a: C.saffron, b: C.coral, i: 0.7 },
  reveal: { a: C.saffron, b: C.saffron, i: 1.25 },
  drawer: { a: C.saffron, b: "#5b2a6e", i: 0.9 },
  allowance: { a: C.saffron, b: "#5b2a6e", i: 0.9 },
  vault: { a: C.saffron, b: "#5b2a6e", i: 0.9 },
  earned: { a: C.saffron, b: C.mint, i: 0.9 },
  brakes: { a: C.coral, b: C.saffron, i: 0.9 },
  onenumber: { a: C.saffron, b: C.mint, i: 0.8 },
  live: { a: C.saffron, b: C.mint, i: 0.7 },
  playground: { a: C.saffron, b: C.mint, i: 0.7 },
  sales: { a: C.saffron, b: C.mint, i: 0.8 },
  bad: { a: C.coral, b: C.amber, i: 0.85 },
  hijack: { a: C.coral, b: C.coral, i: 1 },
  receipts: { a: C.saffron, b: C.mint, i: 0.75 },
  proof: { a: C.mint, b: C.saffron, i: 0.8 },
  close: { a: C.saffron, b: C.saffron, i: 1.15 },
};

const mix = (x: string, y: string, t: number) => {
  const a = parseInt(x.slice(1), 16), b = parseInt(y.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
};

/** Background mood for a frame: each scene's colours, cross-faded over the first second of the next. */
const moodAt = (frame: number): Mood => {
  const i = Math.max(0, SCENES.findIndex((s) => frame >= s.from && frame < s.from + s.frames));
  const cur = MOODS[SCENES[i].id], prev = MOODS[SCENES[Math.max(0, i - 1)].id];
  const t = prog(frame, SCENES[i].from, SCENES[i].from + 60);
  const dim = frame < 90 ? lerp(0.2, 1, prog(frame, 0, 90)) : 1;
  return { a: mix(prev.a, cur.a, t), b: mix(prev.b, cur.b, t), i: lerp(prev.i, cur.i, t), dim };
};

const WIPES = [
  { at: "reveal", num: "02", title: "The *idea.*" },
  { at: "live", num: "03", title: "Live on *Aevum.*" },
  { at: "proof", num: "04", title: "The *proof.*" },
];

const S = (id: string, El: React.FC, extra = 0) => (
  <Sequence key={id} from={scene(id).from} durationInFrames={scene(id).frames + extra} name={id} premountFor={60}>
    <El />
  </Sequence>
);

export const Video: React.FC<{ audio?: boolean }> = ({ audio = true }) => {
  const frame = useCurrentFrame();
  const cur = SCENES.find((s) => frame >= s.from && frame < s.from + s.frames) ?? SCENES[SCENES.length - 1];
  const hideChrome = ["reveal", "close"].includes(cur.id) || (cur.id === "hook" && frame < 150);
  const chromeVis = hideChrome ? 0 : 1;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Atmos mood={moodAt} />
      {S("hook", Hook)}
      {S("guess", Guess)}
      {S("three", Three)}
      {S("wallet", Wallet)}
      {S("reveal", Reveal)}
      <Sequence from={scene("drawer").from} durationInFrames={MACHINE_FRAMES()} name="machine" premountFor={60}>
        <Machine />
      </Sequence>
      {S("brakes", Brakes)}
      {S("onenumber", OneNumber)}
      {S("live", LiveDesk)}
      {S("playground", Playground)}
      {S("sales", Sales)}
      {S("bad", Bad)}
      {S("hijack", Hijack)}
      {S("receipts", Receipts)}
      {S("proof", Proof)}
      {S("close", Close)}
      <ChromeLayer visible={chromeVis} chapter={cur.chapter} />
      <Captions frame={frame} />
      {WIPES.map((w) => (
        <Sequence key={w.at} from={scene(w.at).from - 42} durationInFrames={84} name={`wipe ${w.num}`}>
          <PourWipe num={w.num} title={w.title} />
        </Sequence>
      ))}
      {audio && <Audio src={staticFile("audio/mix.wav")} />}
    </AbsoluteFill>
  );
};

/** Chrome fades rather than pops. */
const ChromeLayer: React.FC<{ visible: number; chapter: number }> = ({ visible, chapter }) => {
  const frame = useCurrentFrame();
  // smooth the on/off switch over 20 frames by looking back
  let v = 0;
  for (let k = 0; k < 20; k++) {
    const f = frame - k;
    const s = SCENES.find((x) => f >= x.from && f < x.from + x.frames);
    const hid = !s || ["reveal", "close"].includes(s.id) || (s.id === "hook" && f < 150);
    v += hid ? 0 : 1;
  }
  return <Chrome frame={frame} visible={(v / 20) * (visible ? 1 : 0.0001 + v / 20)} chapter={chapter} />;
};
