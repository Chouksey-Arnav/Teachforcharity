"use client";
import { useEffect, useRef } from "react";

/**
 * The hero's particle field: dust drifting along five staff lines and, on wide
 * screens, gathering into an eighth note. Dots are the theme's ink and forest
 * colours, read from CSS so nothing is hard-coded. It only animates while on
 * screen and in a visible tab; with reduced motion it draws one still frame.
 */
type Dot = { x: number; y: number; tx: number; ty: number; ph: number; a: number; s: number; g: number; lane: number; v: number; note: boolean; dx: number; dy: number };

function rgb(css: string, fallback: [number, number, number]): [number, number, number] {
  const m = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Points inside an eighth note (head, stem, flag) drawn at `size`, centred on (cx, cy). */
function notePoints(cx: number, cy: number, size: number, count: number): [number, number][] {
  const w = Math.ceil(size * 0.8);
  const h = Math.ceil(size);
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const c = off.getContext("2d");
  if (!c) return [];
  c.fillStyle = "black";
  c.strokeStyle = "black";
  c.lineCap = "round";
  const hx = w * 0.36;
  const hy = h * 0.8;
  c.beginPath();
  c.ellipse(hx, hy, w * 0.27, h * 0.135, (-22 * Math.PI) / 180, 0, Math.PI * 2);
  c.fill();
  const sx = hx + w * 0.235;
  c.lineWidth = w * 0.075;
  c.beginPath();
  c.moveTo(sx, hy - h * 0.04);
  c.lineTo(sx, h * 0.06);
  c.stroke();
  c.lineWidth = w * 0.09;
  c.beginPath();
  c.moveTo(sx, h * 0.07);
  c.bezierCurveTo(sx + w * 0.08, h * 0.24, sx + w * 0.36, h * 0.27, sx + w * 0.28, h * 0.55);
  c.stroke();
  const data = c.getImageData(0, 0, w, h).data;
  const inside: [number, number][] = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (data[(y * w + x) * 4 + 3] > 128) inside.push([x, y]);
  const out: [number, number][] = [];
  for (let i = 0; i < count && inside.length; i++) {
    const [x, y] = inside[(Math.random() * inside.length) | 0];
    out.push([cx - w / 2 + x + Math.random() * 2, cy - h / 2 + y + Math.random() * 2]);
  }
  return out;
}

export function DustField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = getComputedStyle(document.documentElement);
    const ink = rgb(root.getPropertyValue("--lm-ink"), [22, 32, 28]);
    const forest = rgb(root.getPropertyValue("--lm-forest"), [31, 84, 70]);

    let W = 0;
    let H = 0;
    let dots: Dot[] = [];
    let t = reduced ? 40 : 0;
    let raf = 0;
    let running = false;
    const pointer = { x: -1e4, y: -1e4 };

    const lanes = (x: number, lane: number, time: number) => {
      const base = H * (0.3 + lane * 0.1);
      return base + Math.sin(x * 0.0042 + time * 0.25 + lane * 0.5) * H * 0.07 + Math.sin(x * 0.0011 - time * 0.12) * H * 0.09;
    };

    const build = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wide = W >= 1024;
      const streamCount = Math.round(Math.min(2600, W * (wide ? 1.7 : 1.1)));
      dots = [];
      for (let i = 0; i < streamCount; i++) {
        // Most dust hugs its line; a little drifts loose.
        const g = (Math.random() + Math.random() + Math.random() - 1.5) * (Math.random() < 0.85 ? 10 : 46);
        dots.push({ x: Math.random() * W, y: 0, tx: 0, ty: 0, ph: Math.random() * 6.28, a: 0.12 + Math.random() * 0.4, s: Math.random() < 0.9 ? 1.1 : 1.8, g, lane: i % 5, v: 0.25 + Math.random() * 0.55, note: false, dx: 0, dy: 0 });
      }
      if (wide) {
        const size = Math.min(H * 0.62, W * 0.3);
        for (const [x, y] of notePoints(W * 0.25, H * 0.5, size, 2200)) {
          dots.push({ x: Math.random() * W, y: Math.random() * H, tx: x, ty: y, ph: Math.random() * 6.28, a: 0.35 + Math.random() * 0.5, s: Math.random() < 0.85 ? 1.2 : 1.9, g: 0, lane: 0, v: 0, note: true, dx: 0, dy: 0 });
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      // The note gathers over the first two seconds, then breathes.
      const gather = reduced ? 1 : Math.min(1, t / 2.2);
      const ease = 1 - Math.pow(1 - gather, 3);
      for (const d of dots) {
        let x: number;
        let y: number;
        if (d.note) {
          const jx = Math.sin(t * 0.9 + d.ph) * 1.6;
          const jy = Math.cos(t * 0.7 + d.ph) * 1.6;
          x = d.x + (d.tx - d.x) * ease + jx;
          y = d.y + (d.ty - d.y) * ease + jy;
        } else {
          if (!reduced) d.x += d.v;
          if (d.x > W + 4) d.x = -4;
          x = d.x;
          y = lanes(x, d.lane, t) + d.g + Math.sin(t + d.ph) * 2;
        }
        // Dust scatters away from the pointer and settles back.
        const px = x - pointer.x;
        const py = y - pointer.y;
        const dist2 = px * px + py * py;
        if (dist2 < 6400) {
          const f = (1 - Math.sqrt(dist2) / 80) * 2.4;
          d.dx += (px / 80) * f;
          d.dy += (py / 80) * f;
        }
        d.dx *= 0.92;
        d.dy *= 0.92;
        const c = d.note ? forest : ink;
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${d.a})`;
        ctx.fillRect(x + d.dx, y + d.dy, d.s, d.s);
      }
    };

    const frame = () => {
      t += 1 / 60;
      draw();
      raf = requestAnimationFrame(frame);
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

    build();
    draw();

    let inView = true;
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([e]) => {
            inView = e.isIntersecting;
            if (inView && document.visibilityState === "visible") start();
            else stop();
          });
    io?.observe(cv);
    if (!io) start();
    const onVis = () => (document.visibilityState === "visible" && inView ? start() : stop());
    document.addEventListener("visibilitychange", onVis);

    let resizeT = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeT);
      resizeT = window.setTimeout(() => {
        build();
        draw();
      }, 120);
    });
    ro.observe(cv);

    const host = cv.parentElement;
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const onLeave = () => {
      pointer.x = -1e4;
      pointer.y = -1e4;
    };
    if (!reduced) {
      host?.addEventListener("pointermove", onMove);
      host?.addEventListener("pointerleave", onLeave);
    }

    return () => {
      stop();
      io?.disconnect();
      ro.disconnect();
      window.clearTimeout(resizeT);
      document.removeEventListener("visibilitychange", onVis);
      host?.removeEventListener("pointermove", onMove);
      host?.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
