"use client";
import { useEffect, useRef, useState } from "react";
import s from "./landing.module.css";
import { useActive } from "./use-demo";

export type StatTile = { value: number; prefix?: string; suffix?: string; decimals?: number; label: string; src: string };

/** Three colour tiles whose numbers count up the first time they scroll into view. */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useActive(ref, 0.4);
  // Server HTML shows the final numbers. Only count up if the tiles start below
  // the fold, so nobody watches a number snap to 0 first.
  const [armed, setArmed] = useState(false);
  const [t, setT] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top > window.innerHeight) {
      setArmed(true);
      setT(0);
    }
  }, []);

  useEffect(() => {
    if (!armed || !active) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 1400);
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setArmed(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [armed, active]);

  return (
    <div ref={ref} className={s.statRow}>
      {tiles.map((x) => {
        const n = (x.value * t).toFixed(x.decimals ?? 0);
        return (
          <div key={x.label} className={s.stat}>
            {/* Screen readers get the final figure, not the animation. */}
            <span className="sr-only">
              {x.prefix}
              {Number(x.value).toLocaleString("en-US")}
              {x.suffix} {x.label}. {x.src}.
            </span>
            <span className={s.statNum} aria-hidden>
              {x.prefix}
              {Number(n).toLocaleString("en-US", { maximumFractionDigits: x.decimals ?? 0, minimumFractionDigits: x.decimals ?? 0 })}
              {x.suffix}
            </span>
            <span className={s.statLabel} aria-hidden>
              {x.label}
            </span>
            <span className={s.statSrc} aria-hidden>
              {x.src}
            </span>
          </div>
        );
      })}
    </div>
  );
}
