"""Scene timing from the narration: src/timeline.json (read by the edit and by the audio mix)."""

import json

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FPS = 60

vo = {s["id"]: s for s in json.loads((ROOT / "src/vo.json").read_text())}

# id, lead (s before the voice), tail (s after), chapter

SPEC = [

    ("hook", 2.2, 0.5, 1), ("guess", 0.4, 0.5, 1), ("three", 0.4, 0.7, 1), ("wallet", 0.4, 0.9, 1),

    ("reveal", 1.6, 0.8, 2), ("drawer", 0.4, 0.5, 2), ("allowance", 0.3, 0.6, 2), ("vault", 0.3, 0.6, 2),

    ("earned", 0.3, 0.6, 2), ("brakes", 0.3, 0.6, 2), ("onenumber", 0.3, 1.0, 2),

    ("live", 2.0, 0.6, 3), ("playground", 0.3, 0.6, 3), ("sales", 0.3, 0.6, 3), ("bad", 0.3, 0.7, 3),

    ("hijack", 0.3, 0.8, 3), ("receipts", 0.3, 0.9, 3),

    ("proof", 1.0, 0.8, 4), ("close", 0.4, 5.0, 4),

]

import re

narr = {x["id"]: x for x in json.loads((ROOT / "script/narration.json").read_text(encoding="utf-8"))["scenes"]}

norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())



def captions(sid):

    """Map each spoken word to the caption token it belongs to, and group tokens into caption lines."""

    text = narr[sid]["text"].split()

    cap = narr[sid].get("cap", narr[sid]["text"]).split()

    assert len(cap) == len(text), (sid, len(cap), len(text))

    words = vo[sid]["words"]

    # proof: numbers are spelled out in speech; align on the spoken text and show the caption chunk as a whole

    toks, i = [], 0

    for w in words:

        n = norm(w["text"] if "text" in w else w["w"])

        j = i

        while j < len(text) and n and n not in norm(text[j]) and norm(text[j]) not in n: j += 1

        if j >= len(text): j = i

        toks.append(j); i = j

    return text, cap, toks



out, t = [], 0

for sid, lead, tail, ch in SPEC:

    d = vo[sid]["dur"]

    frames = round((lead + d + tail) * FPS)

    text, cap, toks = captions(sid)

    # caption lines: token groups ending at sentence punctuation, or after 8 tokens

    vis = lambda k: cap[k] != "_"
    sentences, cur = [], []
    for k, tok in enumerate(text):
        cur.append(k)
        if re.search(r"[.?!:]$", tok): sentences.append(cur); cur = []
    if cur: sentences.append(cur)
    def split(sen):
        """Split a sentence into lines of at most 8 visible tokens, balanced, preferring breaks after commas."""
        n = sum(vis(k) for k in sen)
        if n <= 8: return [sen]
        best, bi = None, None
        for i in range(1, len(sen)):
            a = sum(vis(k) for k in sen[:i]); b = n - a
            cost = abs(a - b) - (3 if text[sen[i - 1]].endswith(",") else 0) + (10 if min(a, b) < 3 else 0)
            if best is None or cost < best: best, bi = cost, i
        return split(sen[:bi]) + split(sen[bi:])
    lines = [ln for sen in sentences for ln in split(sen)]
    tokStart = {}

    for wi, tk in enumerate(toks): tokStart.setdefault(tk, round((lead + vo[sid]["words"][wi]["s"]) * FPS))

    capLines = []

    for ln in lines:

        starts = [tokStart[k] for k in ln if k in tokStart]

        if not starts: continue

        capLines.append({"f": min(starts), "toks": [{"c": cap[k] if k < len(cap) else text[k], "f": tokStart.get(k, min(starts))} for k in ln if (cap[k] if k < len(cap) else text[k]) != "_"]})

    for a, b in zip(capLines, capLines[1:]): a["e"] = b["f"]

    if capLines: capLines[-1]["e"] = round((lead + d) * FPS) + 12

    out.append({"id": sid, "chapter": ch, "from": t, "frames": frames, "lead": round(lead * FPS), "voFrames": round(d * FPS),

                "words": [{"w": w["w"], "f": round((lead + w["s"]) * FPS), "e": round((lead + w["e"]) * FPS)} for w in vo[sid]["words"]],

                "text": vo[sid]["text"], "captions": capLines})

    t += frames

(ROOT / "src/timeline.json").write_text(json.dumps({"fps": FPS, "total": t, "scenes": out}, indent=1))

print("total", t, "frames =", round(t / FPS, 1), "s")

