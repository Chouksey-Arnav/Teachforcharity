"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Sets `data-on` the first time its box scrolls into view, so CSS can play a
 * one-off entrance on the children. Without scripts or observers it starts on.
 */
export function OnView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setOn(true);
        io.disconnect();
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} data-on={on || undefined}>
      {children}
    </div>
  );
}
