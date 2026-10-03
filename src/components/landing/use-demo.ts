"use client";
import { useEffect, useState, type RefObject } from "react";

/** True when the user has asked for less motion. Starts false so server and client render the same markup. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** True while `ref` is on screen and the tab is visible, so demos never animate unseen. */
export function useActive(ref: RefObject<Element | null>, threshold = 0.25): boolean {
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return inView && visible;
}

/**
 * Walks through `durations` one step at a time while `running`, then calls
 * `onEnd`. Pausing keeps the current step; changing `key` restarts from 0.
 */
export function useSteps(durations: number[], running: boolean, key: unknown, onEnd?: () => void): [number, (n: number) => void] {
  const [state, setState] = useState({ key, step: 0 });
  // Restart when the scenario changes (state derived during render, per React's guidance).
  const current = state.key === key ? state : { key, step: 0 };
  if (current !== state) setState(current);
  const step = current.step;
  useEffect(() => {
    if (!running) return;
    if (step >= durations.length) {
      onEnd?.();
      return;
    }
    const t = window.setTimeout(() => setState((s) => (s.key === key ? { key, step: s.step + 1 } : s)), durations[step]);
    return () => window.clearTimeout(t);
    // durations is a constant per caller and onEnd's identity doesn't matter, so neither is a dependency.
  }, [running, step, key]);
  return [step, (n: number) => setState({ key, step: n })];
}

/** Characters of `text` revealed so far, typed at `cps` characters a second while `running`. */
export function useTyped(text: string, running: boolean, cps = 38): number {
  const [state, setState] = useState({ text, n: 0 });
  const current = state.text === text ? state : { text, n: 0 };
  if (current !== state) setState(current);
  const n = current.n;
  useEffect(() => {
    if (!running || n >= text.length) return;
    // Pause a beat on punctuation so it reads like someone typing.
    const ch = text[n];
    const delay = 1000 / cps + (/[.,!?—]/.test(ch) ? 140 : 0) + Math.random() * 30;
    const t = window.setTimeout(() => setState((s) => (s.text === text ? { text, n: s.n + 1 } : s)), delay);
    return () => window.clearTimeout(t);
  }, [running, n, text, cps]);
  return n;
}
