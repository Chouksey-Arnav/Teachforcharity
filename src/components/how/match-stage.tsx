"use client";
import { useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useActive, useReducedMotion, useSteps } from "@/components/landing/use-demo";
import { cn } from "@/lib/cn";
import s from "./how.module.css";

/** Every tutor around the request. Illustrative names, shown as the real app does: first name + last initial. */
const DOTS: { name: string; x: number; y: number; note?: string; fit?: boolean }[] = [
  { name: "Maya R", x: 20, y: 50, fit: true },
  { name: "Ellie K", x: 80, y: 29, fit: true },
  { name: "Noah P", x: 78, y: 77, fit: true },
  { name: "Jordan T", x: 7, y: 15, note: "Plays trumpet" },
  { name: "Kai N", x: 25, y: 21, note: "Advanced only" },
  { name: "Priya S", x: 42, y: 11, note: "Plays violin" },
  { name: "Ben A", x: 62, y: 10, note: "No shared times" },
  { name: "Grace L", x: 94, y: 9, note: "Plays flute" },
  { name: "Lily W", x: 94, y: 53, note: "Full right now" },
  { name: "Omar D", x: 6, y: 80, note: "Plays cello" },
  { name: "Ana C", x: 31, y: 88, note: "Free Mondays only" },
  { name: "Sam H", x: 56, y: 90, note: "Plays oboe" },
];

/** The three that fit, shown where their dots were. */
const MATCHES: { name: string; score: number; reasons: string[] }[] = [
  { name: "Maya R.", score: 94, reasons: ["Clarinet", "Thu evenings", "Audition prep"] },
  { name: "Ellie K.", score: 89, reasons: ["Clarinet", "Thu evenings", "Reading music"] },
  { name: "Noah P.", score: 83, reasons: ["Clarinet", "Sat mornings", "Wants developing players"] },
];
const FITS = DOTS.filter((t) => t.fit);

// 0 request · 1 tutors appear · 2 non-fits fade · 3 matches (hold) · 4 clear
const PHASES = [900, 1500, 1800, 4400, 700];

export function MatchStage() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const active = useActive(ref);
  const [loop, setLoop] = useState(0);
  const [now] = useSteps(PHASES, active && !reduced, loop, () => setLoop((n) => n + 1));
  const phase = reduced ? 3 : now;
  const clearing = phase >= 4;

  return (
    <div ref={ref} className={s.stageFrame}>
      <p className="sr-only">
        Example: Leo, a developing clarinet player who is free on Thursday evenings, is compared with every tutor. Tutors who play other instruments, only teach
        advanced players or share no free times drop away, and three clarinet tutors are shown with their match scores and reasons.
      </p>
      <div className={cn(s.field, clearing && s.fadeOut)} aria-hidden>
        {phase >= 1 &&
          DOTS.map((t, n) => (
            <span
              key={`${loop}-${t.name}`}
              className={cn(s.dot, !reduced && s.pop)}
              style={{ left: `${t.x}%`, top: `${t.y}%`, animationDelay: `${n * 70}ms` }}
              data-dim={(phase >= 2 && !t.fit) || undefined}
              hidden={(t.fit && phase >= 3) || undefined}
            >
              <Avatar name={t.name} size={t.fit ? 36 : 30} />
              {phase >= 2 && t.note && <span className={s.dotNote}>{t.note}</span>}
            </span>
          ))}
      </div>
      {phase >= 3 && (
        <svg className={cn(s.links, clearing && s.fadeOut)} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {FITS.map((t) => (
            <path key={t.name} d={`M${t.x} ${t.y} Q ${(t.x + 50) / 2} ${t.y < 50 ? 50 : t.y}, 50 50`} />
          ))}
        </svg>
      )}

      <div className={s.request} aria-hidden>
        <div className="flex items-center gap-2.5">
          <Avatar name="Leo" size={30} />
          <p className="text-[13.5px] font-semibold">Leo</p>
          <p className="truncate text-[12px] text-faint">7th grade · Clarinet · Developing</p>
        </div>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink">“I want to get ready for All-District auditions next year. I’m free Thursday evenings.”</p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-faint">
          <span>Parent-approved</span>
          <span>2 goals</span>
          <span>2 free times</span>
        </p>
      </div>

      {phase >= 3 &&
        MATCHES.map((m, n) => (
          <div
            key={`${loop}-${m.name}`}
            className={cn(s.match, !reduced && s.pop, clearing && s.fadeOut)}
            style={{ left: `${FITS[n].x}%`, top: `${FITS[n].y}%`, animationDelay: `${n * 160}ms` }}
            aria-hidden
          >
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold">{m.name}</span>
              <span className="ml-auto font-mono text-[11px] text-pine-700">{m.score} match</span>
            </div>
            <ul className="mt-2 grid gap-1 text-[12px] text-ink-2">
              {m.reasons.map((r) => (
                <li key={r} className="flex items-center gap-1.5">
                  <Check className="size-3 text-pine-700" strokeWidth={3} />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
