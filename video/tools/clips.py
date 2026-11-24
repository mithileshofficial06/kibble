"""Cut the edit clips from the raw testnet recordings: real-time parts, time-lapse ramps, and a hold on the end state."""
import json, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SRC, OUT = ROOT / "footage", ROOT / "public/clips"
OUT.mkdir(parents=True, exist_ok=True)
# clip: ([(source, in s, out s, speed)], hold s at the end)
CLIPS = {
    "live": ([("live2", 1.5, 6.5, 1.0), ("live2", 6.5, 9.4, 0.65)], 4.0),
    "pgintro": ([("sales", 1.8, 8.6, 1.0)], 1.2),
    "sales": ([("sales", 8.6, 11.0, 1.0), ("sales", 11.0, 243.0, 45.0)], 2.4),
    "bad": ([("bad", 9.0, 15.0, 1.5), ("bad", 15.0, 361.9, 60.0)], 5.4),
    "hijack": ([("hijack", 9.0, 27.0, 2.4), ("hijack", 27.0, 207.6, 45.0)], 8.2),
    "receipts": ([("drawerA", 17.5, 21.0, 1.0), ("drawerA", 21.0, 27.0, 2.0)], 1.2),
}
import sys
only = set(sys.argv[1:])
meta = json.loads((ROOT / "src/clips.json").read_text()) if only and (ROOT / "src/clips.json").exists() else {}
for name, (segs, hold) in CLIPS.items():
    if only and name not in only: continue
    args, parts = ["ffmpeg", "-v", "error", "-y"], []
    for i, (src, a, b, sp) in enumerate(segs):
        args += ["-i", str(SRC / f"{src}.mp4")]
        parts.append(f"[{i}:v]trim=start={a}:end={b},setpts=(PTS-STARTPTS)/{sp},fps=30[v{i}]")
    n = len(segs)
    fc = ";".join(parts) + ";" + "".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0,tpad=stop_mode=clone:stop_duration={hold}[o]"
    args += ["-filter_complex", fc, "-map", "[o]", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-g", "15", "-pix_fmt", "yuv420p", str(OUT / f"{name}.mp4")]
    subprocess.run(args, check=True)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(OUT / f"{name}.mp4")]))
    # where each segment starts in the clip, and the source time at the clip's end (for captions like "shown 45x")
    t, marks = 0.0, []
    for (src, a, b, sp) in segs:
        marks.append({"src": src, "at": round(t, 3), "from": a, "to": b, "speed": sp}); t += (b - a) / sp
    meta[name] = {"dur": round(dur, 3), "segments": marks, "hold": hold}
    print(f"{name:<9} {dur:6.2f}s")
(ROOT / "src/clips.json").write_text(json.dumps(meta, indent=1))
