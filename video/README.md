# Kibble demo video

A 3:37 1080p60 demo, made in code: [Remotion](https://www.remotion.dev) for the picture (WebGL on the GPU through ANGLE), real recordings of the app on Aevum testnet, a neural narration voice, and a score and sound design synthesized in Python.

## Pipeline

1. `script/narration.json`: the narration, one entry per scene (`cap` is the on-screen caption when it differs from the spoken text).
2. `python tools/voice.py [scene...]`: narration with word timings (edge-tts, `en-US-AvaMultilingualNeural`) into `public/vo/` and `src/vo.json`.
3. `python tools/timeline.py`: scene timing and caption lines into `src/timeline.json` (shared by the edit and the mix).
4. `node tools/record.mjs footage live sales bad hijack drawerA ...`: records the real app on Aevum testnet at 3200×1800 (needs `next start` on :3005 with `KIBBLE_PLAYGROUND=on`; the Playground shots spend testnet gas).
5. `python tools/clips.py [clip...]`: cuts the edit clips (real time, time-lapse, hold) into `public/clips/` and `src/clips.json`.
6. `python tools/score.py`: original score, sound design, ducking under the voice, loudness to −14 LUFS → `public/audio/mix.wav`.
7. `npm run render` → `out/kibble-demo.mp4`. Stills for review: `node tools/stills.mjs scene@0.5`.

`footage/`, `public/clips/`, `public/audio/` and `out/` are not in git (large, and rebuilt by the steps above).
