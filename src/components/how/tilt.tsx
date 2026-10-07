"use client";
import { useRef, type PointerEvent, type ReactNode } from "react";
import s from "./how.module.css";

/**
 * Tilts its child toward the pointer in 3D, with a glare that follows it.
 * Mouse and trackpad only; touch and reduced motion leave it flat.
 */
export function Tilt({ children, max = 7 }: { children: ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * max}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * max}deg`);
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
    el.dataset.tilt = "";
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    delete el.dataset.tilt;
  };
  return (
    <div ref={ref} className={s.tilt} onPointerMove={move} onPointerLeave={leave}>
      {children}
    </div>
  );
}
