"""
Original score, sound design and final mix, scored to src/timeline.json.

Music: synthesized here (no samples): pads of detuned saws, a sub bass, plucked arpeggios with ping-pong delay,
a soft kick and ticks, bell sparkles, all through a synthetic hall reverb. Sections follow the chapters.
Sound design: grain ticks, chimes, whooshes, impacts, the vault clunk, the brake-ladder tones, clicks.
Mix: narration on top, music ducked under the voice (sidechain), then loudness-normalised by ffmpeg.
Writes public/audio/mix.wav.
"""
import json, subprocess
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
TL = json.loads((ROOT / "src/timeline.json").read_text(encoding="utf-8"))
FPS = TL["fps"]
DUR = TL["total"] / FPS + 0.5
N = int(DUR * SR)
rng = np.random.default_rng(7)
SC = {s["id"]: s for s in TL["scenes"]}


def norm(w):
    return "".join(c for c in w.lower() if c.isalnum())


def T(sid, word=None, nth=1, off=0):
    """Global time in seconds of a word in a scene (or of the scene start), plus `off` frames."""
    s = SC[sid]
    if word is None:
        return (s["from"] + off) / FPS
    n = 0
    for w in s["words"]:
        if norm(w["w"]) == norm(word):
            n += 1
            if n == nth:
                return (s["from"] + w["f"] + off) / FPS
    raise KeyError((sid, word, nth))


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, hz, order=2):
    return sosfilt(butter(order, min(hz, SR * 0.45), "low", fs=SR, output="sos"), x, axis=0)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)


def env(n, a, r, sustain=1.0):
    """Attack/release envelope of n samples (a, r in seconds)."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * sustain
    rel = np.clip((n / SR - t) / max(r, 1e-4), 0, 1)
    return e * rel


def put(buf, t, x, gain=1.0, pan=0.0):
    """Add mono or stereo x into buf at time t."""
    i = int(t * SR)
    if i >= len(buf) or i + len(x) <= 0:
        return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l * 1.414, x * r * 1.414], 1)
    j0 = max(0, -i)
    x = x[j0:]
    i = max(0, i)
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * gain


def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((f * t + phase) % 1.0) - 1


# ------------------------------------------------------------------ sections
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
MINOR = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]]  # Dm Bb Gm A
MAJOR = [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]]  # F C Dm Bb
DARK = [[50, 53, 57], [48, 51, 55], [46, 50, 53], [45, 48, 52]]  # Dm Cm Bb Am(ish)

# per scene: (progression, layer levels: pad, bass, arp, kick, hat, sparkle)
SECTION = {
    "hook": (MINOR, dict(pad=0.55, bass=0.0, arp=0.0, kick=0.0, hat=0.0, spark=0.8)),
    "guess": (MINOR, dict(pad=0.6, bass=0.45, arp=0.0, kick=0.0, hat=0.12, spark=0.3)),
    "three": (MINOR, dict(pad=0.6, bass=0.55, arp=0.15, kick=0.2, hat=0.2, spark=0.1)),
    "wallet": (MINOR, dict(pad=0.6, bass=0.5, arp=0.2, kick=0.25, hat=0.2, spark=0.2)),
    "reveal": (MAJOR, dict(pad=0.8, bass=0.5, arp=0.35, kick=0.0, hat=0.0, spark=1.0)),
    "drawer": (MAJOR, dict(pad=0.6, bass=0.5, arp=0.5, kick=0.35, hat=0.22, spark=0.3)),
    "allowance": (MAJOR, dict(pad=0.6, bass=0.5, arp=0.55, kick=0.4, hat=0.25, spark=0.3)),
    "vault": (MAJOR, dict(pad=0.6, bass=0.55, arp=0.55, kick=0.4, hat=0.25, spark=0.3)),
    "earned": (MAJOR, dict(pad=0.65, bass=0.55, arp=0.6, kick=0.45, hat=0.3, spark=0.4)),
    "brakes": (DARK, dict(pad=0.6, bass=0.55, arp=0.35, kick=0.45, hat=0.25, spark=0.0)),
    "onenumber": (MAJOR, dict(pad=0.6, bass=0.5, arp=0.45, kick=0.3, hat=0.2, spark=0.3)),
    "live": (MAJOR, dict(pad=0.55, bass=0.55, arp=0.5, kick=0.5, hat=0.35, spark=0.2)),
    "playground": (MAJOR, dict(pad=0.55, bass=0.55, arp=0.5, kick=0.5, hat=0.35, spark=0.2)),
    "sales": (MAJOR, dict(pad=0.55, bass=0.6, arp=0.55, kick=0.55, hat=0.4, spark=0.2)),
    "bad": (DARK, dict(pad=0.6, bass=0.6, arp=0.4, kick=0.55, hat=0.35, spark=0.0)),
    "hijack": (DARK, dict(pad=0.65, bass=0.65, arp=0.45, kick=0.6, hat=0.4, spark=0.0)),
    "receipts": (MAJOR, dict(pad=0.55, bass=0.5, arp=0.45, kick=0.4, hat=0.3, spark=0.3)),
    "proof": (MAJOR, dict(pad=0.7, bass=0.6, arp=0.6, kick=0.55, hat=0.4, spark=0.4)),
    "close": (MAJOR, dict(pad=0.8, bass=0.5, arp=0.3, kick=0.0, hat=0.0, spark=0.9)),
}


def section_at(t):
    f = t * FPS
    cur = TL["scenes"][0]
    for s in TL["scenes"]:
        if f >= s["from"]:
            cur = s
    return cur["id"]


def level_curve(key, smooth=1.2):
    """Per-sample level of a layer, following the scenes, smoothed."""
    step = SR // 100
    pts = np.array([SECTION[section_at(i / 100)][1][key] for i in range(int(DUR * 100))])
    k = int(smooth * 100)
    pts = np.convolve(np.pad(pts, (k, k), mode="edge"), np.ones(k) / k, mode="same")[k:-k]
    return np.repeat(pts, step)[:N]


music = np.zeros((N, 2))
pad_bus = np.zeros((N, 2))
arp_bus = np.zeros((N, 2))

# Bars: the problem chapter has its own downbeat grid; the idea chapter restarts the grid at the reveal so the
# big chord lands on it; the live chapter restarts at "live", the proof at "proof".
starts = [0.0, T("reveal"), T("live"), T("proof")]
bars = []
for k, s0 in enumerate(starts):
    s1 = starts[k + 1] if k + 1 < len(starts) else DUR
    t = s0
    i = 0
    while t < s1 - 0.05:
        bars.append((t, min(BAR, s1 - t), i))
        t += BAR
        i += 1

# ---- pad
for t0, d, i in bars:
    prog, lv = SECTION[section_at(t0 + 0.01)]
    chord = prog[i % len(prog)]
    n = int((d + 1.4) * SR)
    x = np.zeros((n, 2))
    for m in chord + [chord[0] - 12, chord[1] + 12]:
        for v in range(5):
            det = (v - 2) * 0.09
            f = mtof(m + det * 0.12)
            s = saw(f * (1 + (v - 2) * 0.0035), n, rng.random())
            pan = (v - 2) / 2.5
            x[:, 0] += s * np.cos((pan + 1) * np.pi / 4)
            x[:, 1] += s * np.sin((pan + 1) * np.pi / 4)
    x = lp(x, 1500 if prog is not MAJOR else 2100, 2) * 0.03
    x *= env(n, 0.9, 1.3)[:, None]
    put(pad_bus, t0 - 0.2, x)

# ---- sub bass: eighth-note pulse on the root, octave jumps on the off-beats
bass_bus = np.zeros((N, 2))
for t0, d, i in bars:
    prog, _ = SECTION[section_at(t0 + 0.01)]
    root = prog[i % len(prog)][0] - 24
    for k in range(int(round(d / (BEAT / 2)))):
        t = t0 + k * BEAT / 2
        n = int(BEAT / 2 * SR * 0.95)
        f = mtof(root + (12 if k % 4 == 3 else 0))
        ph = 2 * np.pi * f * np.arange(n) / SR
        s = np.sin(ph) + 0.25 * np.sin(2 * ph)
        s = np.tanh(s * 1.6) * env(n, 0.006, 0.12)
        put(bass_bus, t, s * 0.16 * (1.0 if k % 2 == 0 else 0.72))

# ---- plucked arpeggio, sixteenths
PATTERN = [0, 1, 2, 3, 2, 1, 2, 4, 0, 2, 1, 3, 4, 2, 3, 1]
for t0, d, i in bars:
    prog, _ = SECTION[section_at(t0 + 0.01)]
    chord = prog[i % len(prog)]
    tones = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24, chord[1] + 24]
    for k in range(int(round(d / (BEAT / 4)))):
        t = t0 + k * BEAT / 4
        m = tones[PATTERN[k % 16]]
        n = int(0.5 * SR)
        f = mtof(m)
        tt = np.arange(n) / SR
        s = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) + 0.12 * np.sin(6 * np.pi * f * tt + 0.3))
        s *= np.exp(-tt * 9) * np.minimum(1, tt / 0.003)
        acc = 1.0 if k % 4 == 0 else 0.62
        put(arp_bus, t, s * 0.05 * acc, pan=0.35 * np.sin(k * 0.9))
# ping-pong delay on the arp (3/16)
dl = int(BEAT * 0.75 * SR)
echo = np.zeros_like(arp_bus)
fb = arp_bus.copy()
for r in range(1, 5):
    sh = np.zeros_like(arp_bus)
    sh[dl * r:] = fb[:-dl * r] * (0.42 ** r)
    if r % 2:
        sh = sh[:, ::-1]
    echo += sh
arp_bus = arp_bus + lp(echo, 3500)

# ---- kick and ticks
drum_bus = np.zeros((N, 2))
for t0, d, i in bars:
    for k in range(int(round(d / BEAT))):
        t = t0 + k * BEAT
        n = int(0.45 * SR)
        tt = np.arange(n) / SR
        f = 45 + 75 * np.exp(-tt * 28)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7.5)
        s += 0.15 * rng.standard_normal(n) * np.exp(-tt * 200)
        put(drum_bus, t, s * 0.34)
hat_bus = np.zeros((N, 2))
for t0, d, i in bars:
    for k in range(int(round(d / (BEAT / 2)))):
        if k % 2 == 0:
            continue
        t = t0 + k * BEAT / 2
        n = int(0.06 * SR)
        s = hp(rng.standard_normal(n), 7000) * np.exp(-np.arange(n) / SR * 70)
        put(hat_bus, t, s * 0.06, pan=0.25)

# ---- bell sparkles (pentatonic), sparse
spark_bus = np.zeros((N, 2))
PENTA = [74, 76, 79, 81, 84, 86, 88, 91]
t = 0.3
while t < DUR:
    m = PENTA[rng.integers(len(PENTA))]
    n = int(2.2 * SR)
    tt = np.arange(n) / SR
    f = mtof(m)
    s = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 4)) * np.exp(-tt * 2.6)
    put(spark_bus, t, s * 0.03, pan=rng.uniform(-0.8, 0.8))
    t += rng.uniform(0.35, 1.1)

# ---- layer levels per scene
music += pad_bus * level_curve("pad")[:, None]
music += bass_bus * level_curve("bass")[:, None]
music += arp_bus * level_curve("arp")[:, None]
music += drum_bus * level_curve("kick", 0.6)[:, None]
music += hat_bus * level_curve("hat", 0.6)[:, None]
music += spark_bus * level_curve("spark")[:, None]

# ------------------------------------------------------------------ sound design
sfx = np.zeros((N, 2))


def chime(f0=1320, dur=1.6, amp=0.2):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f0 * r * tt) * np.exp(-tt * d) for r, a, d in [(1, 1, 3.2), (2.01, 0.4, 5), (2.76, 0.25, 7), (5.4, 0.1, 11)])
    return s * amp * np.minimum(1, tt / 0.002)


def tick(f=3000, amp=0.08, d=0.025):
    n = int(d * SR)
    s = bp(rng.standard_normal(n), f * 0.7, min(f * 1.4, 20000)) * np.exp(-np.arange(n) / SR * (3 / d))
    return s * amp


def whoosh(dur=1.2, up=True, amp=0.25):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    x = rng.standard_normal((n, 2))
    out = np.zeros_like(x)
    seg = n // 24
    for k in range(24):
        a, b = k * seg, (k + 1) * seg if k < 23 else n
        c = 300 * (16 ** (k / 23 if up else 1 - k / 23))
        out[a:b] = bp(x[a:b], c * 0.6, min(c * 1.8, 11000), 1)
    shape = np.sin(np.pi * tt / dur) ** 1.5
    return out * shape[:, None] * amp


def impact(amp=0.6, f=48):
    n = int(2.5 * SR)
    tt = np.arange(n) / SR
    fr = f + 90 * np.exp(-tt * 18)
    s = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt * 2.2)
    s += lp(rng.standard_normal(n), 900) * np.exp(-tt * 9) * 0.5
    return s * amp


def riser(dur=2.0, amp=0.18):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = 200 * (2 ** (tt / dur * 3))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3 + bp(rng.standard_normal(n), 2000, 9000) * 0.4
    return s * (tt / dur) ** 2 * amp


def tone(m, dur=0.6, amp=0.2, decay=5):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = mtof(m)
    s = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * decay) * np.minimum(1, tt / 0.004)
    return s * amp


def thud(amp=0.5):
    n = int(0.9 * SR)
    tt = np.arange(n) / SR
    f = 60 + 60 * np.exp(-tt * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 6) * amp


def clunk(amp=0.5):
    n = int(1.2 * SR)
    tt = np.arange(n) / SR
    metal = sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt * d) for f, d in [(310, 9), (523, 12), (877, 16), (1290, 20)])
    return (np.pad(thud(0.8), (0, n - int(0.9 * SR))) + metal * 0.12) * amp


def buzz(amp=0.12, dur=0.35):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    s = np.sign(np.sin(2 * np.pi * 110 * tt)) * 0.5 + np.sign(np.sin(2 * np.pi * 116.5 * tt)) * 0.5
    return lp(s, 1800) * env(n, 0.01, 0.08) * amp


def grains(t0, t1, rate=40, amp=0.05, f=(2500, 6000)):
    t = t0
    while t < t1:
        put(sfx, t, tick(rng.uniform(*f), amp * rng.uniform(0.4, 1), 0.02), pan=rng.uniform(-0.7, 0.7))
        t += rng.exponential(1 / rate)


F = lambda fr: fr / FPS  # noqa: E731

# hook
put(sfx, T("hook", off=50), chime(1568, 2.4, 0.16))
put(sfx, T("hook", off=40), impact(0.25, 40))
for k in range(0, 160, 3):
    put(sfx, T("hook", "spend", off=k * 3.2 + 46), tick(4200, 0.025), pan=0.5)
# guess
put(sfx, T("guess", "limit", off=0), whoosh(0.9, True, 0.1))
put(sfx, T("guess", "fifty", off=-4), thud(0.35))
put(sfx, T("guess", "guess", off=-2), impact(0.25, 55))
for k in range(3):
    put(sfx, T("guess", "three", off=k * 8), tick(1800, 0.06, 0.04))
# three
for w in ["winning", "losing", "hijacked"]:
    put(sfx, T("three", w, off=-6), tone(76 if w == "winning" else 69 if w == "losing" else 62, 0.8, 0.09))
for d in range(7):
    put(sfx, T("three", "hijacked", off=8 + d * 22 + 14), thud(0.12))
# wallet: typing, strike
for c in range(19):
    put(sfx, T("wallet", "stay", off=-6 + c * 40 / 19), tick(2200, 0.05, 0.015), pan=-0.3)
put(sfx, T("wallet", "guard", off=-8), whoosh(0.35, True, 0.12))
put(sfx, T("wallet", "guard", off=-8), buzz(0.06, 0.25))
put(sfx, T("wallet", "move", off=-6), whoosh(1.6, True, 0.06))
# wipes
for sid in ["reveal", "live", "proof"]:
    put(sfx, T(sid, off=-42 - 120), riser(2.0, 0.12))
    put(sfx, T(sid, off=-42), whoosh(1.0, True, 0.22))
    put(sfx, T(sid, off=16), whoosh(1.0, False, 0.14))
    put(sfx, T(sid, off=12), impact(0.45, 45))
# reveal: grains rain and lock
grains(T("reveal", off=10), T("reveal", off=200), rate=90, amp=0.05)
put(sfx, T("reveal", off=190), chime(1046, 3.0, 0.14))
put(sfx, T("reveal", off=192), chime(1568, 3.0, 0.08))
put(sfx, T("reveal", "this", off=-2), impact(0.4, 42))
# machine
grains(T("drawer", "holds", off=-6), T("drawer", "holds", off=60), rate=60, amp=0.04, f=(1800, 4000))
put(sfx, T("drawer", "key", off=-8), tick(1500, 0.08, 0.05))
put(sfx, T("drawer", "ask", off=-2), whoosh(0.6, True, 0.06))
for k in range(3):
    put(sfx, T("drawer", "pay", off=k * 6 + 30), tick(2600, 0.06))
put(sfx, T("drawer", "pay", off=40), chime(2093, 0.8, 0.07))
put(sfx, T("allowance", "T", off=-12), whoosh(0.7, True, 0.08))
put(sfx, T("allowance", "T", off=10), tone(81, 0.7, 0.06))
grains(T("allowance", "refills", off=10), T("allowance", "work", off=60), rate=35, amp=0.035, f=(1800, 4500))
put(sfx, T("vault", "swept", off=0), whoosh(1.0, True, 0.14))
grains(T("vault", "swept", off=10), T("vault", "swept", off=70), rate=50, amp=0.03)
put(sfx, T("vault", "swept", off=58), clunk(0.55))
put(sfx, T("vault", "reach", off=-6), buzz(0.09))
put(sfx, T("earned", "grows", off=-6), tone(72, 0.5, 0.07))
put(sfx, T("earned", "grows", off=4), tone(76, 0.5, 0.07))
put(sfx, T("earned", "grows", off=14), tone(79, 0.8, 0.07))
put(sfx, T("earned", "shrinks", off=-6), tone(74, 0.5, 0.07))
put(sfx, T("earned", "shrinks", off=6), tone(69, 0.8, 0.07))
for k in range(8):
    put(sfx, T("earned", "window", off=k * 5), tick(3000, 0.05))
# brakes
for k in range(3):
    put(sfx, T("brakes", "overspends", off=10 + k * 22), tick(1800, 0.12, 0.05))
    put(sfx, T("brakes", "overspends", off=10 + k * 22), buzz(0.04, 0.12))
for w, m in [("healthy", 79), ("watch", 74), ("braked", 69), ("paused", 62)]:
    put(sfx, T("brakes", w, off=-4), tone(m, 1.0, 0.1, 3.5))
put(sfx, T("brakes", "paused", off=-4), clunk(0.4))
# one number
for k in range(26):
    put(sfx, T("onenumber", "one", off=k * 1.6), tick(2400, 0.04, 0.012))
for k in range(5):
    put(sfx, T("onenumber", "derived", off=k * 6), tick(1600, 0.06, 0.04))
put(sfx, T("onenumber", "learned", off=-4), chime(1760, 1.2, 0.05))
# playground click
put(sfx, T("playground", off=4.0 * FPS - 40), whoosh(0.6, True, 0.05))
put(sfx, T("playground", off=5.15 * FPS), tick(1200, 0.2, 0.03))
put(sfx, T("playground", off=5.15 * FPS + 4), tick(2400, 0.12, 0.02))
# run cards
pops = [("sales", "pays"), ("sales", "refills"), ("sales", "vault"), ("bad", "jumps"), ("bad", "losing"), ("bad", "refused"),
        ("hijack", "injected"), ("hijack", "key"), ("hijack", "out"), ("receipts", "chain")]
for sid, w in pops:
    put(sfx, T(sid, w, off=-8), tick(1700, 0.07, 0.05))
    put(sfx, T(sid, w, off=-8), tone(84, 0.3, 0.025, 9))
put(sfx, T("bad", "jumps", off=-6), buzz(0.06, 0.3))
put(sfx, T("bad", "pauses", off=-4), clunk(0.4))
put(sfx, T("hijack", "injected", off=-6), buzz(0.06, 0.3))
put(sfx, T("hijack", "nothing", off=-6), clunk(0.4))
for k in range(20):
    put(sfx, T("hijack", "exposure", off=k * 2.5), tick(2600 - k * 60, 0.035, 0.012))
put(sfx, T("hijack", "zero", off=10), chime(1318, 1.6, 0.1))
put(sfx, T("hijack", "zero", off=12), chime(1976, 1.6, 0.05))
# proof
for w, n in [("ninety-seven", 18), ("ten", 10), ("hundred", 34)]:
    for k in range(n):
        put(sfx, T("proof", w, off=k * 1.5), tick(2600, 0.035, 0.012))
put(sfx, T("proof", "worst", off=-4), impact(0.3, 50))
for k in range(5):
    put(sfx, T("proof", "read", off=k * 5), tick(1900, 0.05, 0.03))
# close
put(sfx, T("close", "kibbles", off=-6), tone(77, 1.4, 0.06, 2))
grains(T("close", "dont", off=-40), T("close", "dont", off=150), rate=80, amp=0.045)
put(sfx, T("close", "dont", off=-40), impact(0.55, 40))
put(sfx, T("close", "dont", off=110), chime(1046, 3.5, 0.12))
put(sfx, T("close", "dont", off=112), chime(1568, 3.5, 0.07))
put(sfx, T("close", "dont", off=114), chime(2093, 3.5, 0.04))

# final chord swell under the end card
n = int(7 * SR)
tt = np.arange(n) / SR
swell = np.zeros((n, 2))
for m in [41, 53, 57, 60, 65, 69, 72]:
    for v in range(3):
        s = saw(mtof(m) * (1 + (v - 1) * 0.004), n, rng.random())
        swell[:, v % 2] += s
swell = lp(swell, 1800) * 0.03 * (np.minimum(1, tt / 0.4) * np.exp(-tt * 0.35))[:, None]
put(music, T("close", "dont", off=-40), swell)

# ------------------------------------------------------------------ reverb and mix
def hall(x, secs=3.2, wet=0.28):
    n = int(secs * SR)
    tt = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-tt * 6.9 / secs)[:, None]
    ir = lp(ir, 5000)
    ir[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))[:, None]
    y = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    y *= np.sqrt(np.mean(x ** 2) / max(np.mean(y ** 2), 1e-12))
    return x * (1 - wet) + y * wet


music = hall(music, 3.4, 0.3)
sfx = hall(sfx, 2.2, 0.2)


def load_mp3(p):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(p), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"])
    return np.frombuffer(raw, dtype=np.float32).copy()


vo = np.zeros(N)
for s in TL["scenes"]:
    x = load_mp3(ROOT / "public/vo" / f"{s['id']}.mp3")
    i = int((s["from"] + s["lead"]) / FPS * SR)
    vo[i:i + len(x)] += x[: max(0, N - i)]
# gentle presence lift and a touch of room
vo = vo + 0.25 * hp(vo, 3500)

# sidechain: music ducks under the voice
win = int(0.02 * SR)
rms = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode="same"))
active = (rms > 0.01).astype(float)
# attack 60 ms, release 450 ms
duck = np.zeros(N)
g = 0.0
aa, rr = np.exp(-1 / (0.06 * SR)), np.exp(-1 / (0.45 * SR))
step = 48
for i in range(0, N, step):
    target = active[i]
    c = aa ** step if target > g else rr ** step
    g = target + (g - target) * c
    duck[i:i + step] = g
music_gain = 10 ** ((-9.5 * duck) / 20)
music *= music_gain[:, None]

mix = music * 0.9 + sfx * 0.75 + np.stack([vo, vo], 1) * 1.0
# end fade
mix[-int(1.2 * SR):] *= np.linspace(1, 0, int(1.2 * SR))[:, None]
mix = np.tanh(mix * 1.1) / 1.1
mix /= max(1e-9, np.abs(mix).max()) / 0.89

out = ROOT / "public/audio"
out.mkdir(parents=True, exist_ok=True)
tmp = out / "premix.wav"
import wave
with wave.open(str(tmp), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
# broadcast-style loudness: -14 LUFS integrated, -1 dBTP
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af", "loudnorm=I=-14:TP=-1.0:LRA=11", "-ar", str(SR), str(out / "mix.wav")], check=True)
print("mix written", round(DUR, 1), "s")
