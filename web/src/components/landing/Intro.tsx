"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Loader + hero, one piece of motion.
 * Load: saffron grains (kibble: what an agent earns, one cleared sale at a time) rain down and pile up
 * into the "kibble." wordmark. Then the word splits like a vault door and the page opens behind it.
 * Hero: the grains stay as a living wordmark. The pointer is the attacker: grains it reaches turn coral
 * and freeze (the wallet pauses), then drift home. When nobody touches it, a ghost attacker makes a pass.
 * Scroll: the grains pour down into the big number in the replay below ([data-pour-target]).
 */

type Stage = "load" | "open" | "idle";

type Grain = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  t0: number;
  fd: number;
  landed: boolean;
  heat: number;
  hold: number;
  tint: number;
  tw: number;
  d: number;
  px: number;
  py: number;
};

const TINTS = ["#ffb000", "#ffc53d", "#ff9800", "#ffdc7a"]; // the last one is the full stop
const CORAL = "#ff4d3d";
const TICKS = ["+0.009", "+0.021", "sale cleared", "+0.009", "+0.012", "receipt", "+0.030", "+0.009"];

// Timeline (ms from start).
const T_START = 200;
const T_SPAWN = 1550;
const T_FALL = 480;
const T_FALL_J = 240;
const T_SETTLE = T_START + T_SPAWN + T_FALL + T_FALL_J + 120;
const T_SHINE = 480;
const T_OPEN = T_SETTLE + T_SHINE;
const T_DOOR = 1100;
// The word rides out with the doors, then flies back in and locks.
const T_GAP = 140;
const T_STAGGER = 300;
const T_RET = 1000;
const T_IDLE = T_OPEN + T_DOOR + T_GAP + T_STAGGER + T_RET + 60;
const T_LOCK = T_OPEN + T_DOOR + T_GAP + T_STAGGER * 0.6 + T_RET * 0.42;
const T_PULSE = 650;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const u = clamp((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const quart = (u: number) => (u < 0.5 ? 8 * u ** 4 : 1 - (-2 * u + 2) ** 4 / 2);
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const hex = (n: number) =>
  Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

function sprite(color: string, r: number, dpr: number) {
  const size = Math.max(4, Math.ceil(r * 6 * dpr));
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, color);
  grad.addColorStop(0.26, color);
  grad.addColorStop(0.34, rgba(color, 0.32));
  grad.addColorStop(0.6, rgba(color, 0.08));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function setSpacing(c: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

export function Intro() {
  const [stage, setStage] = useState<Stage>("load");
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tickerRef = useRef<HTMLSpanElement>(null);
  const grabsRef = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const skipRef = useRef<() => void>(() => {});

  // The nav and the rest of the page read the stage from <html data-intro>.
  useEffect(() => {
    document.documentElement.dataset.intro = stage;
  }, [stage]);
  useEffect(() => () => void delete document.documentElement.dataset.intro, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !section || !ctx) return;
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let alive = true;
    let raf = 0;
    let last = 0;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let s = 6;
    let R = 110;
    let sz = 10;
    let grains: Grain[] = [];
    let sprites: HTMLCanvasElement[] = [];
    let coral: HTMLCanvasElement | null = null;
    let white: HTMLCanvasElement | null = null;
    let wm = { left: 0, right: 0, top: 0, bottom: 0 };
    let fam = "system-ui, sans-serif";
    let mono = "monospace";
    let t0 = 0;
    let stg: Stage = reduce ? "idle" : "load";
    let cleared = false;
    let pourEl: Element | null = null;
    let shownGlow = 0;
    const ticks: { x: number; y: number; born: number; text: string }[] = [];
    let lastTick = 0;
    const sparks: { i: number; born: number }[] = [];
    let lastSpark = 0;
    const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, on: false, t: -1e9, touch: false };
    const ghost = { on: false, start: 0, end: 0 };
    let grabs = 0;
    let lastGrab = 0;
    let shownPaused: boolean | null = null;
    let ticker: ReturnType<typeof setInterval> | undefined;

    const go = (st: Stage) => {
      stg = st;
      setStage(st);
    };

    function layout(intro: boolean) {
      W = root.clientWidth;
      H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      const mobile = W < 720;
      R = mobile ? 72 : 118;

      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const o = off.getContext("2d", { willReadFrequently: true })!;
      const word = "kibble.";
      o.font = `600 100px ${fam}`;
      setSpacing(o, -4.5);
      const per = o.measureText(word).width / 100;
      const fs = Math.min((W * (mobile ? 0.93 : 0.78)) / per, H * (mobile ? 0.3 : 0.38));
      o.font = `600 ${fs}px ${fam}`;
      setSpacing(o, -0.045 * fs);
      const mt = o.measureText(word);
      const asc = mt.actualBoundingBoxAscent;
      const desc = mt.actualBoundingBoxDescent;
      const cy = H * (mobile ? 0.42 : 0.45);
      const base = cy + (asc - desc) / 2;
      const left = (W - mt.width) / 2;
      o.fillStyle = "#fff";
      o.fillText(word, left, base);
      const dotX = left + o.measureText("kibble").width;
      wm = { left, right: left + mt.width, top: base - asc, bottom: base + desc };

      const img = o.getImageData(0, 0, W, H).data;
      const x0 = Math.max(0, Math.floor(wm.left) - 4);
      const x1 = Math.min(W, Math.ceil(wm.right) + 4);
      const y0 = Math.max(0, Math.floor(wm.top) - 4);
      const y1 = Math.min(H, Math.ceil(wm.bottom) + 4);
      let fill = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) if (img[(y * W + x) * 4 + 3] > 128) fill++;
      const want = mobile ? 1900 : 2900;
      s = Math.max(mobile ? 2.1 : 2.6, Math.sqrt((fill * 4) / want));

      const pts: [number, number][] = [];
      for (let y = y0 + s / 2; y < y1; y += s)
        for (let x = x0 + s / 2; x < x1; x += s) {
          const jx = x + (Math.random() - 0.5) * s * 0.45;
          const jy = y + (Math.random() - 0.5) * s * 0.45;
          const ix = Math.round(jx);
          const iy = Math.round(jy);
          if (ix >= 0 && iy >= 0 && ix < W && iy < H && img[(iy * W + ix) * 4 + 3] > 140) pts.push([jx, jy]);
        }

      const h = wm.bottom - wm.top || 1;
      grains = pts.map(([x, y]) => {
        const fromBottom = (wm.bottom - y) / h;
        return {
          x,
          y,
          vx: 0,
          vy: 0,
          tx: x,
          ty: y,
          sx: x + (Math.random() - 0.5) * 140,
          sy: -40 - Math.random() * H * 0.35,
          t0: T_START + (fromBottom * 0.72 + Math.random() * 0.28) * T_SPAWN,
          fd: T_FALL + Math.random() * T_FALL_J,
          landed: !intro,
          heat: 0,
          hold: 0,
          tint: x > dotX ? 3 : Math.floor(Math.random() * 3),
          tw: Math.random() * Math.PI * 2,
          d: fromBottom * 0.55 + Math.random() * 0.45,
          px: 0.04 + Math.random() * 0.92,
          py: 0.12 + Math.random() * 0.76,
        };
      });

      const r = s * (mobile ? 0.36 : 0.4);
      sz = r * 6;
      sprites = TINTS.map((c) => sprite(c, r, dpr));
      coral = sprite(CORAL, r, dpr);
      white = sprite("#fffaf0", r, dpr);

      section!.style.setProperty("--wm-top", `${wm.top}px`);
      section!.style.setProperty("--wm-bottom", `${wm.bottom}px`);
      section!.style.setProperty("--wm-left", `${wm.left}px`);
      section!.style.setProperty("--wm-right", `${W - wm.right}px`);
    }

    function open() {
      go("open");
      root.style.overflow = "";
      if (ticker) clearInterval(ticker);
    }

    /**
     * The vault door. Each half of the word rides out with its door (same distance, same easing as the
     * CSS doors), then the grains fly back in from both edges and lock into the word.
     */
    function openPos(g: Grain, tt: number, top: number) {
      const dir = g.tx < W / 2 ? -1 : 1;
      const off = W * 0.51 + 40;
      const by = g.ty + top;
      const j = g.d - 0.5;
      if (tt < T_DOOR) {
        const u = quart(clamp(tt / T_DOOR));
        return [g.tx + dir * off * u, by + j * 26 * u] as const;
      }
      const r = clamp((tt - T_DOOR - T_GAP - g.d * T_STAGGER) / T_RET);
      const e = (1 - Math.pow(2, -9 * r)) / (1 - Math.pow(2, -9));
      return [g.tx + dir * off * (1 - e), by + j * 26 * (1 - e) + Math.sin(Math.PI * r) * j * 70] as const;
    }

    skipRef.current = () => {
      if (stg !== "load") return;
      const top = section!.getBoundingClientRect().top;
      for (const g of grains) {
        g.landed = true;
        g.x = g.tx;
        g.y = g.ty + top;
      }
      t0 = performance.now() - T_OPEN;
    };

    function fallPos(g: Grain, u: number, by: number) {
      const e = 1 - (1 - u) ** 3;
      return [g.sx + (g.tx - g.sx) * e, g.sy + (by - g.sy) * u * u] as const;
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(48, now - (last || now));
      last = now;
      const k = dt / 16.667;
      const t = now - t0;
      const top = section!.getBoundingClientRect().top;
      const scrollP = Math.max(0, -top) / (H * 0.9);

      if (stg === "load" && t >= T_OPEN) open();
      if (stg === "open" && t >= T_IDLE) go("idle");

      // Pour target: the big number in the replay. `pour` runs 0 → 1 as the page scrolls until that
      // number sits where the wordmark was, so the grains can stay on screen the whole way: they hang
      // where they are, stream sideways, and the number rises into them.
      let pr: DOMRect | null = null;
      let pour = 0;
      if (!reduce && stg === "idle" && scrollP > 0.002) {
        if (!pourEl || !pourEl.isConnected) pourEl = document.querySelector("[data-pour-target]");
        pr = pourEl?.getBoundingClientRect() ?? null;
        if (pr) {
          const numMid = pr.top + pr.height / 2 - top; // page y (the section starts at 0)
          const wordMid = (wm.top + wm.bottom) / 2;
          pour = -top / Math.max(200, numMid - wordMid);
        }
      }
      // The number lights up as the grains land in it.
      const glow = smooth(0.78, 0.98, pour) * (1 - smooth(1.02, 1.35, pour));
      if (pourEl instanceof HTMLElement && Math.abs(glow - shownGlow) > 0.01) {
        shownGlow = glow;
        // A filter, not text-shadow: the odometer clips each digit, which would cut the glow into boxes.
        pourEl.style.filter =
          glow > 0.01 ? `drop-shadow(0 0 ${Math.round(6 * glow)}px rgba(255,214,120,${(0.9 * glow).toFixed(2)})) drop-shadow(0 0 ${Math.round(26 * glow)}px rgba(255,176,0,${(0.7 * glow).toFixed(2)}))` : "";
      }

      if (stg !== "load" && (pour >= 1 || (!pr && scrollP > 1.15))) {
        if (!cleared) {
          ctx!.setTransform(1, 0, 0, 1, 0, 0);
          ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
          cleared = true;
        }
        return;
      }
      cleared = false;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);

      // The attacker: the real pointer, or a ghost pass when nobody has touched it for a while.
      const real = ptr.on && now - ptr.t < 2500;
      let ax = ptr.x;
      let ay = ptr.y;
      let attacking = real && stg === "idle" && scrollP < 0.35 && ptr.y < top + H;
      if (!real && stg === "idle" && !reduce && scrollP < 0.2) {
        if (!ghost.on && now - ghost.end > (ghost.end ? 5200 : 1400)) {
          ghost.on = true;
          ghost.start = now;
        }
      } else if (real) ghost.on = false;
      if (ghost.on) {
        const u = (now - ghost.start) / 1900;
        if (u >= 1) {
          ghost.on = false;
          ghost.end = now;
        } else {
          const e = quart(u);
          ax = wm.left - R * 0.6 + (wm.right - wm.left + R * 1.2) * e;
          ay = top + (wm.top + wm.bottom) / 2 + Math.sin(u * Math.PI * 2.2) * (wm.bottom - wm.top) * 0.28;
          attacking = true;
        }
      }
      if (attacking && ghost.on) {
        ptr.vx = 0;
        ptr.vy = 0;
      }

      const shine = stg === "load" && t > T_SETTLE ? (t - T_SETTLE) / T_SHINE : -1;
      const sweepX = wm.left - 160 + (wm.right - wm.left + 320) * shine;
      const damp = Math.pow(0.84, k);
      const holdDamp = Math.pow(0.8, k);
      const release = scrollP > 0.04;
      const half = sz / 2;
      // A pulse of light runs out from the centre when the two halves lock back together.
      const pulse = t >= T_LOCK && t < T_LOCK + T_PULSE ? (t - T_LOCK) / T_PULSE : -1;
      const pulseR = pulse * (wm.right - wm.left) * 0.62;
      const spring = pour > 0 ? 0.075 : 0.055;
      let disturbed = 0;
      let held = 0;

      ctx!.globalCompositeOperation = "lighter";

      for (let i = 0; i < grains.length; i++) {
        const g = grains[i];
        let bx = g.tx;
        let by = g.ty + top;
        let a = 1;
        let scale = 1;

        if (stg === "load" && !g.landed) {
          if (t < g.t0) continue;
          const u = Math.min(1, (t - g.t0) / g.fd);
          [g.x, g.y] = fallPos(g, u, by);
          if (u >= 1) {
            g.landed = true;
            g.x = g.tx;
            g.y = by;
            g.vy = -(0.6 + Math.random() * 2.4);
            g.vx = (Math.random() - 0.5) * 1.4;
            if (now - lastTick > 95 && ticks.length < 18) {
              lastTick = now;
              ticks.push({ x: g.x, y: g.y, born: now, text: TICKS[Math.floor(Math.random() * TICKS.length)] });
            }
          } else {
            // A short motion trail while it falls.
            const sp = sprites[g.tint];
            for (const [lag, al] of [
              [0.07, 0.32],
              [0.14, 0.14],
            ] as const) {
              if (u - lag <= 0) continue;
              const [gx, gy] = fallPos(g, u - lag, by);
              ctx!.globalAlpha = al;
              ctx!.drawImage(sp, gx - half, gy - half, sz, sz);
            }
          }
        } else if (stg === "open") {
          const tt = t - T_OPEN;
          [g.x, g.y] = openPos(g, tt, top);
          g.vx = 0;
          g.vy = 0;
          // Streak behind grains in flight.
          if (tt > 40) {
            const [gx, gy] = openPos(g, tt - 40, top);
            if (Math.abs(gx - g.x) > 4) {
              ctx!.globalAlpha = 0.28;
              ctx!.drawImage(sprites[g.tint], gx - half, gy - half, sz, sz);
            }
          }
        } else {
          if (pr && pour > 0) {
            // Each grain's own progress: a little ahead or behind the scroll, equal at both ends.
            const q = clamp(pour + (g.d - 0.5) * 0.32 * Math.sin(Math.PI * clamp(pour)));
            const ex = q * q * (3 - 2 * q);
            const px = pr.left + g.px * pr.width;
            const py = pr.top + g.py * pr.height;
            const ay0 = g.ty + top;
            // Sideways: eased, with a gentle S-curve so the stream reads as a ribbon.
            bx = g.tx + (px - g.tx) * ex + Math.sin(Math.PI * q) * (g.d - 0.5) * 140;
            // Down the page: linear in q, which cancels the scroll and keeps the grain on screen,
            // then a quick final drop into the digits.
            const yq = q + (1 - q) * smooth(0.62, 0.94, q);
            by = ay0 + (py - ay0) * yq;
            a = (q > 0.03 && q < 0.9 ? 0.9 : 1) * (1 - smooth(0.9, 1, q));
            scale = 1 - 0.55 * smooth(0.8, 1, q);
          }
          if (!reduce) {
            bx += Math.sin(now * 0.0011 + g.tw) * 0.5;
            by += Math.cos(now * 0.0013 + g.tw) * 0.5;
          }
          if (attacking) {
            const dx = g.x - ax;
            const dy = g.y - ay;
            const d2 = dx * dx + dy * dy;
            if (d2 < R * R) {
              const d = Math.sqrt(d2) || 1;
              const f = 1 - d / R;
              g.vx += ((dx / d) * f * 4.2 + ptr.vx * 0.08 * f) * k;
              g.vy += ((dy / d) * f * 4.2 + ptr.vy * 0.08 * f) * k;
              const sp = Math.hypot(g.vx, g.vy);
              if (sp > 12) {
                g.vx *= 12 / sp;
                g.vy *= 12 / sp;
              }
              g.heat = 1;
              g.hold = 700 + Math.random() * 450;
              disturbed++;
            }
          }
          if (release) g.hold = 0;
          if (g.hold > 0) {
            g.hold -= dt;
            g.vx *= holdDamp;
            g.vy *= holdDamp;
            held++;
          } else {
            g.vx = (g.vx + (bx - g.x) * spring * k) * damp;
            g.vy = (g.vy + (by - g.y) * spring * k) * damp;
            if (g.heat > 0) g.heat = Math.max(0, g.heat - dt / 650);
          }
          g.x += g.vx * k;
          g.y += g.vy * k;
        }

        if (!reduce) a *= 0.8 + 0.2 * Math.sin(now * 0.003 + g.tw * 3);
        if (a <= 0.01) continue;
        if (g.heat < 1) {
          ctx!.globalAlpha = a * (1 - g.heat);
          if (scale < 1) ctx!.drawImage(sprites[g.tint], g.x - half * scale, g.y - half * scale, sz * scale, sz * scale);
          else ctx!.drawImage(sprites[g.tint], g.x - half, g.y - half, sz, sz);
        }
        if (g.heat > 0 && coral) {
          ctx!.globalAlpha = a * g.heat;
          ctx!.drawImage(coral, g.x - half, g.y - half, sz, sz);
        }
        if (pulse >= 0 && white) {
          const q = (Math.abs(g.x - W / 2) - pulseR) / 45;
          const w = Math.exp(-q * q) * (1 - pulse);
          if (w > 0.02) {
            ctx!.globalAlpha = w * 0.9;
            ctx!.drawImage(white, g.x - half, g.y - half, sz, sz);
          }
        }
        if (shine >= 0 && shine <= 1 && white) {
          const q = (g.x - sweepX) / 55;
          const w = Math.exp(-q * q);
          if (w > 0.02) {
            ctx!.globalAlpha = w * 0.85;
            ctx!.drawImage(white, g.x - half, g.y - half, sz, sz);
          }
        }
      }

      // Sparkles: now and then a grain catches the light.
      if (stg === "idle" && !reduce && grains.length && now - lastSpark > 120 && scrollP < 0.5) {
        lastSpark = now;
        sparks.push({ i: Math.floor(Math.random() * grains.length), born: now });
      }
      for (let j = sparks.length - 1; j >= 0; j--) {
        const sp = sparks[j];
        const age = (now - sp.born) / 650;
        const g = grains[sp.i];
        if (age >= 1 || !g) {
          sparks.splice(j, 1);
          continue;
        }
        if (white && g.heat < 0.5) {
          ctx!.globalAlpha = Math.sin(age * Math.PI) * 0.9;
          const big = sz * 1.9;
          ctx!.drawImage(white, g.x - big / 2, g.y - big / 2, big, big);
        }
      }

      ctx!.globalCompositeOperation = "source-over";

      // The seam of light, then the door edges sliding away.
      if (shine > 0.35 && stg === "load") {
        const u = smooth(0.35, 1, shine);
        drawSeam(W / 2, u, 1);
      } else if (stg === "open") {
        const u = quart(clamp((t - T_OPEN) / T_DOOR));
        const off = (W / 2) * u;
        drawSeam(W / 2 - off, 1, 1 - u);
        drawSeam(W / 2 + off, 1, 1 - u);
      }

      // "+0.009" ticks where grains land.
      ctx!.font = `500 11px ${mono}`;
      ctx!.textAlign = "center";
      for (let j = ticks.length - 1; j >= 0; j--) {
        const tk = ticks[j];
        const age = (now - tk.born) / 950;
        if (age >= 1) {
          ticks.splice(j, 1);
          continue;
        }
        ctx!.globalAlpha = Math.sin(age * Math.PI) * 0.95;
        ctx!.fillStyle = tk.text.startsWith("+") ? "#ffc53d" : "#ede8e3";
        ctx!.fillText(tk.text, tk.x, tk.y - 14 - age * 30);
      }

      // The attacker's crosshair.
      if (attacking) {
        ctx!.globalAlpha = 0.7;
        ctx!.strokeStyle = CORAL;
        ctx!.lineWidth = 1;
        ctx!.setLineDash([3, 5]);
        ctx!.beginPath();
        ctx!.arc(ax, ay, R * 0.82, now * 0.0015, now * 0.0015 + Math.PI * 2);
        ctx!.stroke();
        ctx!.setLineDash([]);
        ctx!.beginPath();
        ctx!.moveTo(ax - 7, ay);
        ctx!.lineTo(ax + 7, ay);
        ctx!.moveTo(ax, ay - 7);
        ctx!.lineTo(ax, ay + 7);
        ctx!.stroke();
        ctx!.globalAlpha = 0.95;
        ctx!.fillStyle = CORAL;
        ctx!.textAlign = "left";
        ctx!.font = `500 10.5px ${mono}`;
        ctx!.fillText(ghost.on ? "ATTACKER (DEMO)" : "ATTACKER · YOU", ax + R * 0.62, ay - R * 0.62);
      }
      ctx!.globalAlpha = 1;

      ptr.vx *= 0.8;
      ptr.vy *= 0.8;

      // The readout under the wordmark.
      if (disturbed > 0 && now - lastGrab > 260) {
        lastGrab = now;
        grabs++;
        if (grabsRef.current) grabsRef.current.textContent = String(grabs);
      }
      const isPaused = held > 0;
      if (isPaused !== shownPaused && statusRef.current) {
        shownPaused = isPaused;
        statusRef.current.dataset.state = isPaused ? "paused" : "healthy";
        statusRef.current.textContent = isPaused ? "Paused" : "Healthy";
      }
    }

    function drawSeam(x: number, len: number, alpha: number) {
      if (alpha <= 0.01) return;
      const cy = H / 2;
      const h = (H / 2) * len;
      const g = ctx!.createLinearGradient(0, cy - h, 0, cy + h);
      g.addColorStop(0, rgba("#ffb000", 0));
      g.addColorStop(0.5, rgba("#fff1cc", alpha));
      g.addColorStop(1, rgba("#ffb000", 0));
      ctx!.globalAlpha = 1;
      ctx!.fillStyle = g;
      ctx!.fillRect(x - 1, cy - h, 2, h * 2);
      const glow = ctx!.createLinearGradient(x - 22, 0, x + 22, 0);
      glow.addColorStop(0, rgba("#ffb000", 0));
      glow.addColorStop(0.5, rgba("#ffb000", 0.1 * alpha));
      glow.addColorStop(1, rgba("#ffb000", 0));
      ctx!.fillStyle = glow;
      ctx!.fillRect(x - 22, cy - h, 44, h * 2);
    }

    // Input.
    const onMove = (e: PointerEvent) => {
      if (ptr.on && !ptr.touch) {
        ptr.vx = e.clientX - ptr.x;
        ptr.vy = e.clientY - ptr.y;
      }
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      // Over a link or button (the fixed nav sits above the canvas), the pointer is a visitor, not an attacker.
      ptr.on = !(e.target instanceof Element && e.target.closest("a, button, .k-navbar"));
      ptr.touch = e.pointerType !== "mouse";
      ptr.t = performance.now();
    };
    const onLeave = () => {
      ptr.on = false;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") setTimeout(() => (ptr.on = false), 350);
    };
    const onKey = (e: KeyboardEvent) => {
      if (stg === "load" && (e.key === "Escape" || e.key === "Enter" || e.key === " ")) skipRef.current();
    };
    let resizeT: ReturnType<typeof setTimeout> | undefined;
    let lastW = 0;
    let lastH = 0;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        const w = root.clientWidth;
        const h = window.innerHeight;
        if (w === lastW && Math.abs(h - lastH) < 140) return;
        lastW = w;
        lastH = h;
        if (stg === "load") {
          t0 = performance.now() - T_OPEN;
        }
        layout(false);
      }, 180);
    };

    (async () => {
      const cs = getComputedStyle(root);
      fam = cs.getPropertyValue("--font-geist").trim() || fam;
      mono = cs.getPropertyValue("--font-geist-mono").trim() || mono;
      try {
        await Promise.race([document.fonts.load(`600 100px ${fam}`), new Promise((r) => setTimeout(r, 1500))]);
      } catch {
        /* fall back to whatever is loaded */
      }
      if (!alive) return;
      if (reduce) {
        go("idle");
      } else {
        if ("scrollRestoration" in history) history.scrollRestoration = "manual";
        window.scrollTo(0, 0);
        root.style.overflow = "hidden";
        ticker = setInterval(() => {
          if (tickerRef.current)
            tickerRef.current.textContent = `receipt 0x${hex(4)}…${hex(4)} · +0.0${Math.floor(Math.random() * 30 + 5)
              .toString()
              .padStart(2, "0")} cleared`;
        }, 85);
      }
      layout(!reduce);
      lastW = root.clientWidth;
      lastH = window.innerHeight;
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    })();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (pourEl instanceof HTMLElement) pourEl.style.filter = "";
      if (ticker) clearInterval(ticker);
      clearTimeout(resizeT);
      root.style.overflow = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const scrollOn = () => document.getElementById("replay")?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <section ref={sectionRef} className="k-intro" data-stage={stage} aria-label="Kibble">
        <div className="k-aurora" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="k-grain" aria-hidden="true" />

        <h1 className="sr-only">Kibble: spending power for AI agents, earned grain by grain</h1>

        <p className="k-intro-eyebrow k-rv" style={{ "--d": "0.15s" } as React.CSSProperties} aria-hidden="true">
          <span className="k-dot" /> Earned spending limits for AI agents
        </p>

        <div className="k-intro-frame" aria-hidden="true">
          <i className="tl" />
          <i className="tr" />
          <i className="bl" />
          <i className="br" />
          <span className="k-intro-fig">fig. 01</span>
          <span className="k-intro-key">1 grain = 1 cleared sale</span>
        </div>

        <div className="k-intro-below">
          <p className="k-intro-tag" aria-hidden="true">
            {["Spending", "power,"].map((w, i) => (
              <span key={w} className="k-rv" style={{ "--d": `${0.3 + i * 0.07}s` } as React.CSSProperties}>
                {w}{" "}
              </span>
            ))}
            <em className="k-rv" style={{ "--d": "0.44s" } as React.CSSProperties}>
              earned
            </em>{" "}
            {["grain", "by", "grain."].map((w, i) => (
              <span key={i} className="k-rv" style={{ "--d": `${0.52 + i * 0.07}s` } as React.CSSProperties}>
                {w}{" "}
              </span>
            ))}
          </p>
          <p className="k-intro-hint k-rv" style={{ "--d": "0.8s" } as React.CSSProperties}>
            <span className="k-hint-mouse">Run your cursor through the name. You&apos;re the attacker.</span>
            <span className="k-hint-touch">Drag across the name. You&apos;re the attacker.</span>
          </p>
          <p className="k-intro-readout k-rv" style={{ "--d": "0.95s" } as React.CSSProperties} aria-hidden="true">
            <span>
              grabs refused <b ref={grabsRef}>0</b>
            </span>
            <span>
              stolen <b>0.000</b>
            </span>
            <span ref={statusRef} className="k-intro-status" data-state="healthy">
              Healthy
            </span>
          </p>
        </div>

        <div className="k-intro-foot">
          <span className="k-rv k-intro-meta" style={{ "--d": "1s" } as React.CSSProperties}>
            QDay Aevum testnet · chain 44005
          </span>
          <button type="button" className="k-cue k-rv" style={{ "--d": "1.1s" } as React.CSSProperties} onClick={scrollOn}>
            <span>Scroll · watch the replay</span>
            <i aria-hidden="true" />
          </button>
          <span className="k-rv k-intro-meta right" style={{ "--d": "1s" } as React.CSSProperties}>
            K—00 / 02
          </span>
        </div>
      </section>

      <canvas ref={canvasRef} className="k-intro-canvas" aria-hidden="true" />

      {stage !== "idle" && (
        <div className="k-doors" data-stage={stage}>
          <div className="k-door l" />
          <div className="k-door r" />
          <div className="k-loader-ui">
            <span className="k-loader-brand">
              kibble<b>.</b>
            </span>
            <span className="k-loader-meta">Minting spending power</span>
            <span className="k-loader-ticker" ref={tickerRef} aria-hidden="true">
              receipt 0x0000…0000 · +0.009 cleared
            </span>
            <button type="button" className="k-loader-skip" onClick={() => skipRef.current()}>
              Skip intro →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
