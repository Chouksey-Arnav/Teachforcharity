"use client";
import { useEffect } from "react";

/**
 * Fades `.rv` elements up as they scroll into view. Mounted once per page; the
 * CSS only hides `.rv` when scripts run and motion is allowed, so without this
 * component everything is simply visible.
 */
export function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".rv:not(.in)"));
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
