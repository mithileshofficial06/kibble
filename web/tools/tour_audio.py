"""The tour's sound: a neural voice, a soft synthesized score ducked under it, and the timings the 3D scene follows.

  python web/tools/tour_audio.py          -> web/public/tour/tour.mp3, web/src/tour/timeline.json
"""
import asyncio, json, re, subprocess, wave
from pathlib import Path

import edge_tts
import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

WEB = Path(__file__).resolve().parents[1]
OUT = WEB / "public/tour"
TMP = OUT / ".tmp"
VOICE = "en-US-AvaMultilingualNeural"
SR = 48000

# id, chapter, seconds before the voice, seconds after, what is said
SCENES = [
    ("spend", 1, 1.6, 0.6, "AI agents have started to spend money, all by themselves. So who decides how much?"),
    ("guess", 1, 0.3, 0.6, "Usually, we pick a number. Fifty a day, every day. But a fixed limit is only a guess."),
    ("box", 2, 0.5, 0.5, "Kibble works differently. The agent's money sits in a cash box. The agent can't open it. It can only ask."),
    ("sale", 2, 0.4, 0.8, "A customer pays into the box. The agent asks to buy what the job needs. The box checks, and pays the supplier."),
    ("vault", 2, 0.3, 0.7, "And when the customer is happy, the profit drops into your vault. A place the agent can never reach."),
    ("limit", 2, 0.3, 1.0, "Nobody guesses the limit. It is earned. Every good round lifts it. Every loss lowers it."),
    ("busy", 3, 0.8, 1.6, "Now let's put them side by side. The same customers, on the same busy day. On the left, the fixed limit runs out, and people are turned away. On the right, Kibble serves every one of them, and its limit keeps climbing."),
    ("loss", 4, 0.8, 1.6, "Next, a bad day. The supplier raises its price, and every sale now loses money. The fixed limit keeps on paying, until a person steps in. Kibble's wallet doesn't wait. Strike one. Strike two. Strike three. Then it stops the agent, by itself."),
    ("thief", 5, 0.8, 0.6, "And now, the worst day. A thief steals the agent's key."),
    ("grab", 5, 0.2, 1.6, "On the left, the thief simply spends the limit, round after round. On the right, every grab hits the wall. Refused. Refused. And then the box locks itself. The thief walks away with nothing."),
    ("honest", 6, 0.5, 0.6, "Is it perfect? No. A patient thief, taking tiny amounts, isn't always stopped. So Kibble alerts you, and one button freezes everything."),
    ("keys", 6, 0.3, 0.8, "To start again takes two keys. Yours, and your guardian's. One stolen key is never enough."),
    ("end", 7, 0.8, 4.5, "So don't give your agent a budget. Let it earn one."),
]


def run(*cmd):
    subprocess.run(list(map(str, cmd)), check=True)


async def speak(sid, text):
    words = []
    mp3 = TMP / f"{sid}.mp3"
    c = edge_tts.Communicate(text, VOICE, rate="+0%", boundary="WordBoundary")
    with open(mp3, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"w": ch["text"], "s": ch["offset"] / 1e7})
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(mp3), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"])
    return np.frombuffer(raw, dtype=np.float32).copy(), words


def lp(x, hz):
    return sosfilt(butter(2, hz, "low", fs=SR, output="sos"), x, axis=0)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def captions(text, words, lead):
    """Sentences, each split at commas when long, with the time each starts."""
    toks = text.split()
    norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())
    starts, j = [], 0
    for k, t in enumerate(toks):
        while j < len(words) and not (norm(words[j]["w"]) and (norm(words[j]["w"]) in norm(t) or norm(t) in norm(words[j]["w"]))):
            j += 1
        starts.append(words[j]["s"] if j < len(words) else (starts[-1] if starts else 0))
        j += 1
    out, cur = [], []
    for k, t in enumerate(toks):
        cur.append(k)
        n = len(cur)
        if re.search(r"[.?!]$", t) or (t.endswith(",") and n >= 6 and len(toks) - k > 3):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return [{"t": round(lead + starts[c[0]], 2), "text": " ".join(toks[k] for k in c)} for c in out]


async def main():
    TMP.mkdir(parents=True, exist_ok=True)
    t, scenes, voice = 0.0, [], []
    for sid, ch, lead, tail, text in SCENES:
        x, words = await speak(sid, text)
        dur = len(x) / SR
        scenes.append({
            "id": sid, "chapter": ch, "from": round(t, 3), "dur": round(lead + dur + tail, 3), "text": text,
            "captions": captions(text, words, lead),
            "words": [{"w": w["w"], "t": round(lead + w["s"], 2)} for w in words],
        })
        voice.append((t + lead, x))
        t += lead + dur + tail
        print(f"{sid:7} {dur:5.1f}s")
    total = t
    N = int((total + 0.2) * SR)
    vo = np.zeros(N)
    for at, x in voice:
        i = int(at * SR)
        vo[i:i + len(x)] += x[: N - i]

    # ---- score: slow pads and a sparse pluck; darker for the bad days
    rng = np.random.default_rng(11)
    major, dark = [[53, 57, 60, 64], [48, 55, 60, 64], [50, 57, 60, 65], [46, 53, 57, 62]], [[50, 53, 57, 62], [46, 53, 58, 62], [43, 50, 55, 58], [45, 52, 57, 60]]
    at = lambda sid: next(s for s in scenes if s["id"] == sid)
    grim = (at("loss")["from"], at("honest")["from"])
    music = np.zeros((N, 2))
    bar = 4.0
    for b in range(int(total / bar) + 1):
        t0 = b * bar
        prog = dark if grim[0] - 1 <= t0 < grim[1] else major
        chord = prog[b % 4]
        n = int((bar + 2.2) * SR)
        tt = np.arange(n) / SR
        env = np.clip(tt / 1.6, 0, 1) * np.clip((bar + 2.2 - tt) / 2.2, 0, 1)
        pad = np.zeros((n, 2))
        for m in chord + [chord[0] - 12]:
            for v in range(3):
                f = midi(m) * (1 + (v - 1) * 0.0032)
                s = 2 * ((f * tt + rng.random()) % 1) - 1
                pad[:, 0] += s * (1.2 - 0.5 * v)
                pad[:, 1] += s * (0.2 + 0.5 * v)
        pad = lp(pad, 1150 if prog is dark else 1500) * env[:, None] * 0.012
        i = int(t0 * SR)
        e = min(N, i + n)
        if e > i:
            music[i:e] += pad[: e - i]
        for k in range(8):
            if rng.random() < (0.45 if prog is dark else 0.7):
                m = chord[rng.integers(4)] + 12 * rng.integers(1, 3)
                nn = int(1.4 * SR)
                q = np.arange(nn) / SR
                s = (np.sin(2 * np.pi * midi(m) * q) + 0.25 * np.sin(4 * np.pi * midi(m) * q)) * np.exp(-q * 4.2) * np.minimum(1, q / 0.004) * 0.028
                j = int((t0 + k * 0.5) * SR)
                pan = rng.uniform(0.25, 0.75)
                e = min(N, j + nn)
                if e > j:
                    music[j:e, 0] += s[: e - j] * (1 - pan)
                    music[j:e, 1] += s[: e - j] * pan
    # ---- a few hits: the stops, the theft, the end
    def hit(sec, f=46, amp=0.4):
        nn = int(2.2 * SR)
        q = np.arange(nn) / SR
        s = np.sin(2 * np.pi * np.cumsum(f + 80 * np.exp(-q * 18)) / SR) * np.exp(-q * 2.4) * amp
        j = int(sec * SR)
        e = min(N, j + nn)
        if e > j:
            music[j:e] += s[: e - j, None]
    def word(sid, w, nth=1):
        s = at(sid)
        hits = [x for x in s["words"] if x["w"].lower().strip(".,'") == w]
        return s["from"] + hits[min(nth, len(hits)) - 1]["t"]
    hit(at("box")["from"], 50, 0.3)
    hit(at("busy")["from"], 50, 0.25)
    hit(word("loss", "stops"), 42, 0.5)
    hit(at("thief")["from"] + 0.2, 38, 0.5)
    hit(word("grab", "locks"), 42, 0.5)
    hit(at("end")["from"], 48, 0.35)
    ir_n = int(2.8 * SR)
    ir = rng.standard_normal((ir_n, 2)) * np.exp(-np.arange(ir_n) / SR * 2.4)[:, None]
    wet = np.stack([fftconvolve(music[:, c], ir[:, c])[:N] for c in range(2)], 1)
    wet *= np.sqrt(np.mean(music ** 2) / max(np.mean(wet ** 2), 1e-12))
    music = music * 0.65 + wet * 0.35
    # duck under the voice
    act = (np.sqrt(np.convolve(vo ** 2, np.ones(960) / 960, mode="same")) > 0.01).astype(float)
    g, duck, step = 0.0, np.zeros(N), 48
    up, dn = np.exp(-step / (0.08 * SR)), np.exp(-step / (0.6 * SR))
    for i in range(0, N, step):
        c = up if act[i] > g else dn
        g = act[i] + (g - act[i]) * c
        duck[i:i + step] = g
    music *= (10 ** (-8.5 * duck / 20))[:, None]
    fade = np.minimum(1, np.minimum(np.arange(N) / (1.2 * SR), (N - np.arange(N)) / (2.2 * SR)))
    mix = music * 1.5 * fade[:, None] + np.stack([vo, vo], 1)
    mix = np.tanh(mix * 1.05)
    mix /= np.abs(mix).max() / 0.9
    wav = TMP / "tour.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype("<i2").tobytes())
    run("ffmpeg", "-v", "error", "-y", "-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-b:a", "128k", OUT / "tour.mp3")
    (WEB / "src/tour").mkdir(exist_ok=True)
    (WEB / "src/tour/timeline.json").write_text(json.dumps({"total": round(total, 2), "scenes": scenes}, indent=1) + "\n", encoding="utf-8")
    for f in TMP.iterdir():
        f.unlink()
    TMP.rmdir()
    print("total", round(total, 1), "s")


asyncio.run(main())
