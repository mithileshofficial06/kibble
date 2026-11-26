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

## The 3D film (26 Nov)

A second, fully animated film: `Film` (with the mix), `FilmVO` (narration only) and `FilmSilent`. About 3:05 at 1080p60. An original 3D world built in code (React Three Fiber in Remotion): a robot shopkeeper, the locked glass box (the drawer), the spending tray, the owner's safe, customers, a thief, and the blockchain as a row of glass blocks. Studio light from Lightformers, soft shadows, ambient occlusion (N8AO), depth of field, bloom and AgX tone mapping. Fonts: Bricolage Grotesque, Manrope, JetBrains Mono. The numbers in chapter 3 come from the testnet runs in EVIDENCE.md; the two screens show real recordings of the app.

1. `script/film.json`: the narration, in plain words.
2. `python tools/film_voice.py`: narration into `public/film/vo/` and `src/film/vo.json`.
3. `python tools/film_timeline.py`: scene timing into `src/film/timeline.json`.
4. `node tools/film_record.mjs footage/film hijack3d drawerA` (run it where `playwright` is installed; needs the app on :3005 with the Playground on; the run spends free testnet gas), then cut `public/film/clips/play.mp4` and `drawer.mp4` with ffmpeg (14 s and 13 s).
5. `python tools/film_score.py`: score, sound design and mix → `public/film/mix.wav` (−14 LUFS).
6. `npx remotion render Film out/kibble-film.mp4 --gl=angle --concurrency=3 --crf=16` (about 0.6 s a frame on an RTX 3050 laptop; more than 3 tabs times out on 4 GB). Stills: `node tools/film_stills.mjs scene@0.5`, contact sheets: `python tools/sheet.py`.

Code: `src/film/` (`director.ts` camera and layout, `sets.tsx` the four sets, `assets.tsx` the models, `World.tsx` the canvas and effects, `Overlay.tsx` titles, labels, cards and captions, `ScreenVideos.tsx` maps the recordings onto the 3D screens). The effects composer builds its passes one render late, so `ComposerGate` holds the first frame of each tab until it can draw.
