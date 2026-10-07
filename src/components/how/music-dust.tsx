"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import s from "./how.module.css";

/**
 * Music made of dust. One particle engine, four uses on the How it works page:
 *
 * - hero:   a dotted staff scrolling like sheet music, its notes swelling and
 *           throwing sparks as they cross a playhead, and a big dust shape that
 *           morphs note → beamed notes → heart (tap to skip; scroll to scatter).
 * - step:   a giant dust numeral that morphs as the steps change.
 * - ribbon: a strip of the scrolling staff, to run the music down the page.
 * - word:   the wordmark, gathering from scattered dust when it comes into view.
 *
 * Particles chase their targets on springs, so changing shape swirls rather
 * than fades. Colours come from the theme's CSS variables. It only animates
 * while on screen in a visible tab; with reduced motion it draws one still frame.
 */
export type DustVariant = "hero" | "step" | "ribbon" | "word";

const HERO_SHAPES = [
  { key: "note", label: "Learn it" },
  { key: "beamed", label: "Play it together" },
  { key: "heart", label: "Give it back" },
];

type RGB = [number, number, number];
function hex(css: string, fallback: RGB): RGB {
  const m = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------- shapes
type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
const tilt = (-22 * Math.PI) / 180;
function head(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, tilt, 0, Math.PI * 2);
  c.fill();
}
function bar(c: CanvasRenderingContext2D, x: number, y1: number, y2: number, w: number) {
  c.fillRect(x - w / 2, Math.min(y1, y2), w, Math.abs(y2 - y1));
}
/** Width-to-height ratio of each drawn shape. */
const ASPECT: Record<string, number> = { note: 0.8, beamed: 1.05, heart: 1.08 };
const DRAW: Record<string, Draw> = {
  note: (c, w, h) => {
    head(c, w * 0.36, h * 0.8, w * 0.27, h * 0.135);
    bar(c, w * 0.6, h * 0.78, h * 0.05, w * 0.08);
    c.lineWidth = w * 0.09;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(w * 0.6, h * 0.07);
    c.bezierCurveTo(w * 0.68, h * 0.24, w * 0.96, h * 0.27, w * 0.88, h * 0.55);
    c.stroke();
  },
  beamed: (c, w, h) => {
    const sw = w * 0.065;
    head(c, w * 0.21, h * 0.84, w * 0.16, h * 0.105);
    head(c, w * 0.71, h * 0.74, w * 0.16, h * 0.105);
    bar(c, w * 0.345, h * 0.82, h * 0.16, sw);
    bar(c, w * 0.845, h * 0.72, h * 0.06, sw);
    c.beginPath();
    c.moveTo(w * 0.31, h * 0.16);
    c.lineTo(w * 0.88, h * 0.04);
    c.lineTo(w * 0.88, h * 0.17);
    c.lineTo(w * 0.31, h * 0.29);
    c.closePath();
    c.fill();
  },
  heart: (c, w, h) => {
    c.beginPath();
    c.moveTo(w * 0.5, h * 0.96);
    c.bezierCurveTo(w * 0.12, h * 0.7, -w * 0.02, h * 0.4, w * 0.12, h * 0.18);
    c.bezierCurveTo(w * 0.24, -h * 0.02, w * 0.45, h * 0.03, w * 0.5, h * 0.25);
    c.bezierCurveTo(w * 0.55, h * 0.03, w * 0.76, -h * 0.02, w * 0.88, h * 0.18);
    c.bezierCurveTo(w * 1.02, h * 0.4, w * 0.88, h * 0.7, w * 0.5, h * 0.96);
    c.fill();
  },
};

/** Draws into a scratch canvas and returns `count` random points inside the ink, offset by (ox, oy). */
function sample(w: number, h: number, draw: Draw, count: number, ox: number, oy: number, step = 2): Float32Array {
  const out = new Float32Array(count * 2);
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const c = off.getContext("2d", { willReadFrequently: true });
  if (!c) return out;
  c.fillStyle = "black";
  c.strokeStyle = "black";
  draw(c, w, h);
  const data = c.getImageData(0, 0, w, h).data;
  const inside: number[] = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] > 120) inside.push(x, y);
  const m = inside.length / 2;
  for (let i = 0; i < count; i++) {
    const j = m ? ((Math.random() * m) | 0) * 2 : 0;
    out[i * 2] = ox + (m ? inside[j] : w / 2) + Math.random() * step;
    out[i * 2 + 1] = oy + (m ? inside[j + 1] : h / 2) + Math.random() * step;
  }
  return out;
}

/** 34 points spread through a unit ellipse: a notehead made of dust. */
const HEAD_DOTS: [number, number][] = Array.from({ length: 34 }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / 34);
  const a = i * 2.39996;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

// ---------------------------------------------------------------- engine
type Engine = { setShape: (key: string) => void; next: () => void; destroy: () => void };

function createEngine(cv: HTMLCanvasElement, variant: DustVariant, initial: string, onShape: (i: number) => void, onLayout: (x: number, y: number) => void): Engine {
  const ctx = cv.getContext("2d")!;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const root = getComputedStyle(document.documentElement);
  const ink = hex(root.getPropertyValue("--lm-ink"), [22, 32, 28]);
  const forest = hex(root.getPropertyValue("--lm-forest"), [31, 84, 70]);
  const gold = hex(root.getPropertyValue("--color-brass-600"), [168, 123, 42]);
  const pine = hex(root.getPropertyValue("--color-pine-500"), [61, 128, 105]);
  const colors = [forest, gold, pine, ink].map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);
  const serif = root.getPropertyValue("--font-source-serif").trim() || "Georgia, serif";

  let W = 0;
  let H = 0;
  let mobile = false;
  let t = 0;
  let raf = 0;
  let running = false;
  let inView = false;
  let gathered = variant !== "word";
  let shapeKey = initial;
  let heroIdx = 0;
  const pointer = { x: -1e4, y: -1e4 };

  // Shape particles: position, velocity, target, spring, size, alpha, colour, phase.
  let n = 0;
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);
  let tx = new Float32Array(0);
  let ty = new Float32Array(0);
  let kk = new Float32Array(0);
  let sz = new Float32Array(0);
  let al = new Float32Array(0);
  let ph = new Float32Array(0);
  let col = new Uint8Array(0);
  let box = { cx: 0, cy: 0, h: 0 };

  // Staff: dust along five lines, plus notes riding them.
  let staff = false;
  let ln = 0;
  let lx = new Float32Array(0);
  let lo = new Float32Array(0);
  let li = new Uint8Array(0);
  let la = new Float32Array(0);
  let y0 = 0;
  let gap = 12;
  let amp = 10;
  let speed = 0.5;
  let playX = 0;
  let staffFade = false;
  type Note = { x: number; p: number; c: number; played: boolean };
  let notes: Note[] = [];
  type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: number };
  let sparks: Spark[] = [];

  const staffY = (i: number, x: number) => y0 + (i - 2) * gap + Math.sin(x * 0.0034 + t * 0.55) * amp + Math.sin(x * 0.0009 - t * 0.22) * amp * 0.8;

  const shapeDraw = (key: string): { draw: Draw; w: number; h: number; cx: number; cy: number; step: number } => {
    if (key.startsWith("num:")) {
      const ch = key.slice(4);
      const h = box.h;
      return {
        draw: (c, w, hh) => {
          c.font = `600 ${hh * 1.18}px ${serif}`;
          c.textAlign = "center";
          c.textBaseline = "alphabetic";
          c.fillText(ch, w / 2, hh * 0.98);
        },
        w: h * 0.9,
        h,
        cx: box.cx,
        cy: box.cy,
        step: 2,
      };
    }
    if (key === "word") {
      const lines = W < 700 ? [["Teach ", "for a"], ["Cause"]] : [["Teach ", "for a", " Cause"]];
      const draw: Draw = (c, w, h) => {
        const seg = (str: string, k: number, size: number) => {
          c.font = `${k === 1 ? "italic 500" : "600"} ${size}px ${serif}`;
          return c.measureText(str).width;
        };
        const widest = Math.max(...lines.map((l) => l.reduce((a, str, k) => a + seg(str, k, 100), 0)));
        const size = Math.min((w * 0.94 * 100) / widest, (h * 0.8) / lines.length / 1.02);
        c.textBaseline = "middle";
        lines.forEach((l, row) => {
          const total = l.reduce((a, str, k) => a + seg(str, k, size), 0);
          let x = (w - total) / 2;
          const y = h / 2 + (row - (lines.length - 1) / 2) * size * 1.02;
          l.forEach((str, k) => {
            seg(str, k, size);
            c.fillText(str, x, y);
            x += c.measureText(str).width;
          });
        });
      };
      return { draw, w: W, h: H, cx: W / 2, cy: H / 2, step: W > 900 ? 3 : 2 };
    }
    const a = ASPECT[key] ?? 1;
    return { draw: DRAW[key] ?? DRAW.note, w: box.h * a, h: box.h, cx: box.cx, cy: box.cy, step: 2 };
  };

  const retarget = (key: string, kick: boolean) => {
    shapeKey = key;
    if (!gathered) {
      for (let i = 0; i < n; i++) {
        tx[i] = Math.random() * W;
        ty[i] = Math.random() * H;
      }
      return;
    }
    const d = shapeDraw(key);
    const pts = sample(d.w, d.h, d.draw, n, d.cx - d.w / 2, d.cy - d.h / 2, d.step);
    for (let i = 0; i < n; i++) {
      tx[i] = pts[i * 2];
      ty[i] = pts[i * 2 + 1];
      if (kick) {
        // A swirl on the way to the new shape.
        const a = Math.random() * Math.PI * 2;
        const f = 2 + Math.random() * 7;
        vx[i] += Math.cos(a) * f;
        vy[i] += Math.sin(a) * f;
      }
    }
    if (reduced) {
      px.set(tx);
      py.set(ty);
    }
  };

  const build = () => {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    mobile = W < 1024;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    staff = variant === "hero" || variant === "ribbon";
    if (variant === "hero") {
      if (mobile) {
        const h = Math.min(190, W * 0.46);
        box = { cx: W * 0.5, cy: 30 + h / 2, h };
        y0 = box.cy + h * 0.08;
        gap = 13;
        playX = W * 0.5;
      } else {
        const h = Math.min(H * 0.56, W * 0.27);
        box = { cx: W * 0.25, cy: H * 0.48, h };
        y0 = H * 0.5;
        gap = 22;
        playX = W * 0.25;
      }
      staffFade = !mobile;
      n = mobile ? 1300 : 2800;
      onLayout(box.cx, box.cy + box.h / 2 + (mobile ? 12 : 26));
    } else if (variant === "ribbon") {
      y0 = H / 2;
      gap = mobile ? 10 : 13;
      playX = W * 0.5;
      n = 0;
    } else if (variant === "step") {
      const h = Math.min(H * 0.98, 300);
      box = { cx: W - h * 0.42 - 6, cy: H / 2, h };
      n = mobile ? 900 : 1500;
    } else {
      n = Math.round(Math.min(4200, Math.max(1500, W * 3)));
    }
    amp = gap * (variant === "ribbon" ? 1.1 : 1.3);
    speed = mobile ? 0.45 : 0.6;

    px = new Float32Array(n);
    py = new Float32Array(n);
    vx = new Float32Array(n);
    vy = new Float32Array(n);
    tx = new Float32Array(n);
    ty = new Float32Array(n);
    kk = new Float32Array(n);
    sz = new Float32Array(n);
    al = new Float32Array(n);
    ph = new Float32Array(n);
    col = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = Math.random() * W;
      py[i] = Math.random() * H;
      kk[i] = 0.022 + Math.random() * 0.04;
      sz[i] = Math.random() < 0.82 ? 1.5 : 2.4;
      al[i] = 0.45 + Math.random() * 0.55;
      ph[i] = Math.random() * 6.283;
      const r = Math.random();
      col[i] = r < 0.62 ? 0 : r < 0.82 ? 1 : r < 0.94 ? 2 : 3;
    }
    if (n) retarget(shapeKey, false);
    if (reduced) {
      px.set(tx);
      py.set(ty);
    }

    ln = staff ? Math.round(Math.min(2000, W * (variant === "ribbon" ? 1.25 : mobile ? 1.6 : 1.3))) : 0;
    lx = new Float32Array(ln);
    lo = new Float32Array(ln);
    li = new Uint8Array(ln);
    la = new Float32Array(ln);
    for (let i = 0; i < ln; i++) {
      lx[i] = Math.random() * W;
      lo[i] = (Math.random() + Math.random() - 1) * 1.8;
      li[i] = i % 5;
      la[i] = 0.3 + Math.random() * 0.45;
    }
    const count = staff ? Math.max(3, Math.round(W / (mobile ? 120 : 170))) : 0;
    notes = Array.from({ length: count }, (_, i) => ({ x: (i + Math.random() * 0.6) * (W / count), p: Math.floor(Math.random() * 9), c: i % 3 === 2 ? 1 : 0, played: false }));
    sparks = [];
  };

  const scatterNow = () => {
    if (variant !== "hero") return 0;
    const r = cv.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / (r.height * 0.75)));
  };

  const burst = (bx: number, by: number, power = 1) => {
    for (let i = 0; i < n; i++) {
      const dx = px[i] - bx;
      const dy = py[i] - by;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > 320) continue;
      const f = ((320 - d) / 320) * 16 * power;
      vx[i] += (dx / d) * f;
      vy[i] += (dy / d) * f;
    }
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2;
      const v = 2 + Math.random() * 3;
      sparks.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: k % 2 });
    }
  };

  const drawNote = (x: number, y: number, p: number, scale: number, color: string, alpha: number) => {
    const rx = gap * 0.7 * scale;
    const ry = gap * 0.5 * scale;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    for (const [u, v] of HEAD_DOTS) {
      const ex = u * rx;
      const ey = v * ry;
      ctx.fillRect(x + ex * ct - ey * st, y + ex * st + ey * ct, 2.1, 2.1);
    }
    const up = p < 4;
    const sx = up ? x + rx * 0.86 : x - rx * 0.86;
    const len = gap * 3.3 * scale;
    for (let d = 0; d < len; d += 2) ctx.fillRect(sx, up ? y - d : y + d, 1.8, 1.8);
  };

  const frame = () => {
    t += 1 / 60;
    ctx.clearRect(0, 0, W, H);

    if (staff) {
      // Staff lines of dust, fading under the headline on wide screens.
      ctx.fillStyle = colors[3];
      for (let i = 0; i < ln; i++) {
        if (!reduced) {
          lx[i] += speed;
          if (lx[i] > W + 2) lx[i] = -2;
        }
        const x = lx[i];
        let y = staffY(li[i], x) + lo[i];
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 3600) y += (dy >= 0 ? 1 : -1) * (60 - Math.sqrt(d2)) * 0.35;
        ctx.globalAlpha = la[i] * (staffFade && x > W * 0.46 ? 0.16 : 1);
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      // Notes ride the staff; crossing the playhead "plays" them.
      for (const no of notes) {
        if (!reduced) no.x += speed;
        if (no.x > W + 30) {
          no.x = -30;
          no.p = Math.floor(Math.random() * 9);
          no.played = false;
        }
        const y = staffY(4, no.x) - (no.p * gap) / 2;
        const dist = Math.abs(no.x - playX);
        const near = Math.max(0, 1 - dist / 70);
        if (!no.played && no.x >= playX && !reduced) {
          no.played = true;
          for (let k = 0; k < 14; k++) {
            const a = Math.random() * Math.PI * 2;
            const v = 0.8 + Math.random() * 2.2;
            sparks.push({ x: no.x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, life: 1, c: no.c });
          }
        }
        const fade = staffFade && no.x > W * 0.46 ? 0.2 : 1;
        drawNote(no.x, y, no.p, 1 + near * 0.55, colors[no.c === 1 ? 1 : 0], (0.62 + near * 0.38) * fade);
      }
    }

    // Shape particles.
    if (n) {
      const sc = scatterNow();
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = colors[c];
        for (let i = 0; i < n; i++) {
          if (col[i] !== c) continue;
          if (!reduced) {
            let gx = tx[i] + Math.sin(t * 1.3 + ph[i]) * 1.4;
            let gy = ty[i] + Math.cos(t * 1.1 + ph[i]) * 1.4;
            if (!gathered) {
              gx += Math.sin(t * 0.4 + ph[i] * 3) * 40;
              gy += Math.cos(t * 0.35 + ph[i] * 2) * 30;
            }
            if (sc > 0) {
              gx += (tx[i] - box.cx) * sc * 2 + Math.cos(ph[i] * 7) * sc * 160;
              gy += (ty[i] - box.cy) * sc * 2 + Math.sin(ph[i] * 5) * sc * 160;
            }
            vx[i] = (vx[i] + (gx - px[i]) * kk[i]) * 0.86;
            vy[i] = (vy[i] + (gy - py[i]) * kk[i]) * 0.86;
            const dx = px[i] - pointer.x;
            const dy = py[i] - pointer.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 8100) {
              const d = Math.sqrt(d2) || 1;
              const f = (1 - d / 90) * 2.6;
              vx[i] += (dx / d) * f;
              vy[i] += (dy / d) * f;
            }
            px[i] += vx[i];
            py[i] += vy[i];
          }
          ctx.globalAlpha = al[i] * (1 - sc * 0.6);
          ctx.fillRect(px[i], py[i], sz[i], sz[i]);
        }
      }
    }

    // Sparks.
    if (sparks.length) {
      for (const sp of sparks) {
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vx *= 0.95;
        sp.vy = sp.vy * 0.95 + 0.03;
        sp.life -= 0.02;
        ctx.fillStyle = colors[sp.c === 1 ? 1 : 0];
        ctx.globalAlpha = Math.max(0, sp.life);
        ctx.fillRect(sp.x, sp.y, 2, 2);
      }
      sparks = sparks.filter((sp) => sp.life > 0);
    }
    ctx.globalAlpha = 1;
    if (running) raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (running || reduced) return;
    running = true;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  // The hero's shape changes on its own every few seconds.
  let cycle = 0;
  const armCycle = () => {
    window.clearInterval(cycle);
    if (variant === "hero" && !reduced) cycle = window.setInterval(() => running && next(), 4200);
  };
  const next = () => {
    if (variant !== "hero") return;
    heroIdx = (heroIdx + 1) % HERO_SHAPES.length;
    onShape(heroIdx);
    retarget(HERO_SHAPES[heroIdx].key, true);
    if (reduced) frame();
  };

  build();
  frame();
  armCycle();

  const io =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          ([e]) => {
            inView = e.isIntersecting;
            if (inView && !gathered) {
              gathered = true;
              retarget(shapeKey, false);
              if (reduced) frame();
            }
            if (inView && document.visibilityState === "visible") start();
            else stop();
          },
          { threshold: variant === "word" ? 0.35 : 0 },
        );
  io?.observe(cv);
  if (!io) {
    inView = true;
    gathered = true;
    retarget(shapeKey, false);
    start();
  }
  const onVis = () => (document.visibilityState === "visible" && inView ? start() : stop());
  document.addEventListener("visibilitychange", onVis);

  let resizeT = 0;
  let lastW = W;
  const ro = new ResizeObserver(() => {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      // Phones resize on every address-bar show/hide; only rebuild for real width changes.
      if (Math.abs(cv.getBoundingClientRect().width - lastW) < 2 && variant !== "step") return;
      build();
      lastW = W;
      frame();
    }, 150);
  });
  ro.observe(cv);

  // Fonts for the numerals and wordmark may arrive after the first draw.
  document.fonts?.ready.then(() => {
    if (shapeKey.startsWith("num:") || shapeKey === "word") {
      retarget(shapeKey, false);
      if (reduced) frame();
    }
  });

  const host = cv.parentElement?.parentElement ?? cv.parentElement;
  const onMove = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
  };
  const onLeave = () => {
    pointer.x = -1e4;
    pointer.y = -1e4;
  };
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest("a,button,input,select,textarea,label")) return;
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    burst(x, y, variant === "hero" ? 1 : 0.7);
    if (variant === "hero") {
      next();
      armCycle();
    }
  };
  if (!reduced) {
    if (fine) {
      host?.addEventListener("pointermove", onMove);
      host?.addEventListener("pointerleave", onLeave);
    }
    if (variant === "hero" || variant === "word") host?.addEventListener("pointerdown", onDown);
  }

  return {
    setShape: (key) => {
      if (key === shapeKey) return;
      retarget(key, true);
      if (reduced) frame();
    },
    next,
    destroy: () => {
      stop();
      window.clearInterval(cycle);
      io?.disconnect();
      ro.disconnect();
      window.clearTimeout(resizeT);
      document.removeEventListener("visibilitychange", onVis);
      host?.removeEventListener("pointermove", onMove);
      host?.removeEventListener("pointerleave", onLeave);
      host?.removeEventListener("pointerdown", onDown);
    },
  };
}

export function MusicDust({ variant, index = 0, className }: { variant: DustVariant; index?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const [label, setLabel] = useState(0);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const first = useRef(variant === "step" ? `num:${index + 1}` : variant === "word" ? "word" : HERO_SHAPES[0].key);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cv.getContext("2d")) return;
    engine.current = createEngine(cv, variant, first.current, setLabel, (x, y) => setAt({ x, y }));
    setReady(true);
    return () => {
      engine.current?.destroy();
      engine.current = null;
    };
  }, [variant]);

  useEffect(() => {
    if (variant === "step") engine.current?.setShape(`num:${index + 1}`);
  }, [variant, index]);

  return (
    <div className={cn(s.dustWrap, className)} data-ready={ready || undefined} aria-hidden>
      <canvas ref={ref} className={s.dustCanvas} />
      {variant === "hero" && at && (
        <span className={s.dustLabel} style={{ left: at.x, top: at.y }}>
          <span key={label} className={s.dustLabelIn}>
            {String(label + 1).padStart(2, "0")} · {HERO_SHAPES[label].label}
          </span>
        </span>
      )}
    </div>
  );
}
