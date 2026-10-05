"use client";
import { useEffect } from "react";

/**
 * Fades `.rv` elements up as they scroll into view. Mounted once in the public
 * site's layout; it also picks up `.rv` elements that arrive later (client
 * navigation, streamed sections). The CSS only hides `.rv` when scripts run and
 * motion is allowed, so without this component everything is simply visible.
 */
export function Reveal() {
  useEffect(() => {
    const pending = () => Array.from(document.querySelectorAll<HTMLElement>(".rv:not(.in)"));
    if (typeof IntersectionObserver === "undefined") {
      const showAll = () => pending().forEach((el) => el.classList.add("in"));
      showAll();
      const mo = new MutationObserver(showAll);
      mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }
    const watched = new WeakSet<Element>();
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
    const watch = () => {
      for (const el of pending()) {
        if (watched.has(el)) continue;
        watched.add(el);
        io.observe(el);
      }
    };
    watch();
    // The demos re-render constantly; check at most once a frame.
    let frame = 0;
    const mo = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), watch()));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      io.disconnect();
    };
  }, []);
  return null;
}
