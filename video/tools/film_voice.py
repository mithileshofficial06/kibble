"""Film narration (the 3D film): one mp3 per scene with word timings (edge-tts neural voice). Writes public/vo/<id>.mp3 and src/vo.json."""
import asyncio, json, subprocess, sys
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
spec = json.loads((ROOT / "script/film.json").read_text(encoding="utf-8"))
only = set(sys.argv[1:])

def duration(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]).decode())

async def one(scene):
    out = ROOT / "public/film/vo" / f"{scene['id']}.mp3"
    words = []
    c = edge_tts.Communicate(scene["text"], spec["voice"], rate=scene.get("rate", spec["rate"]), boundary="WordBoundary")
    with open(out, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"w": ch["text"], "s": round(ch["offset"] / 1e7, 3), "e": round((ch["offset"] + ch["duration"]) / 1e7, 3)})
    return {"id": scene["id"], "text": scene["text"], "dur": round(duration(out), 3), "words": words}

async def main():
    path = ROOT / "src/film/vo.json"
    old = {s["id"]: s for s in json.loads(path.read_text())} if path.exists() else {}
    res = []
    for s in spec["scenes"]:
        r = await one(s) if (not only or s["id"] in only or s["id"] not in old) else old[s["id"]]
        res.append(r)
        print(f"{r['id']:<11} {r['dur']:6.2f}s  {len(r['words'])} words")
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(res, indent=1))
    print("total", round(sum(r["dur"] for r in res), 1), "s")

asyncio.run(main())
