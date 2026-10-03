"use client";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Check, GraduationCap, Music2, Pause, Play, Printer, Users, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import s from "./landing.module.css";
import { useActive, useReducedMotion, useTyped } from "./use-demo";

const ROTATE_MS = 11000;

type Role = {
  id: string;
  tab: string;
  icon: typeof Music2;
  kick: string;
  how: string;
  sub: string;
  wants: string;
  app: string;
  meta: string;
  body: ReactNode;
};

const ROLES: Role[] = [
  {
    id: "student",
    tab: "Students",
    icon: Music2,
    kick: "For middle schoolers",
    how: "Get help with the exact thing you’re stuck on.",
    sub: "See tutors who play your instrument, check when they’re free, and request a time. It’s one-on-one, so the whole lesson is about you.",
    wants: "“I can’t hit the high notes on my trumpet and my tone gets airy. Saturdays work best.”",
    app: "Find a tutor",
    meta: "Student view",
    body: (
      <div className={s.stagger}>
        <TutorRow name="Jordan T." sub="10th grade · Trumpet" chip={<span className={cn(s.chip, s.chipOk)}>Great match</span>} />
        <TutorRow name="Sam K." sub="11th grade · Trumpet" chip={<span className={cn(s.chip, s.chipOk)}>Good match</span>} />
        <TutorRow name="Alex P." sub="12th grade · French horn" chip={<span className={cn(s.chip, s.chipMuted)}>Related instrument</span>} />
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
          <span className="text-[12.5px] text-[#6b736e]">
            Jordan is free <b className="font-semibold text-ink">Sat 10:00</b> and <b className="font-semibold text-ink">11:00 AM</b>
          </span>
          <span className={s.request}>
            Request Sat 10:00 <ArrowRight className="size-3.5" />
          </span>
        </div>
      </div>
    ),
  },
  {
    id: "parent",
    tab: "Parents",
    icon: Users,
    kick: "For parents & guardians",
    how: "Stay in the loop without sitting in.",
    sub: "You create the account and sign consent. After that, every message is readable from your dashboard, and a Sunday summary says what happened and what to practice.",
    wants: "“I want to know who my daughter is talking to — and what she should practice this week.”",
    app: "Sunday summary",
    meta: "Parent email",
    body: (
      <div className={cn(s.digest, s.stagger)}>
        <div className={s.digestBlock}>
          <p className={s.digestLabel}>This week</p>
          <p className="mt-1 flex items-center gap-2 text-[13.5px]">
            <Video className="size-3.5 text-[#1f5446]" /> 1 lesson · 45 min with <b className="font-semibold">Maya R.</b>
            <span className={cn(s.chip, s.chipOk, "ml-auto")}>Confirmed</span>
          </p>
        </div>
        <div className={s.digestBlock}>
          <p className={s.digestLabel}>What to practice</p>
          <ul className="mt-1.5 space-y-1 text-[13.5px]">
            <li>· Long tones, five minutes a day</li>
            <li>· F major scale, slurred</li>
            <li>· Etude, measures 12–24, slowly at first</li>
          </ul>
        </div>
        <div className={s.digestBlock}>
          <p className={s.digestLabel}>Messages</p>
          <p className="mt-1 text-[13.5px]">3 this week — you can read every one in your dashboard.</p>
        </div>
      </div>
    ),
  },
  {
    id: "tutor",
    tab: "Tutors",
    icon: GraduationCap,
    kick: "For high school musicians",
    how: "Teach what you love. Keep hours you can prove.",
    sub: "Choose when you’re free and which levels you like teaching. After each lesson you log it, the family confirms it, and our nonprofit partner verifies it.",
    wants: "“I need volunteer hours I can actually prove — and I’d love to teach beginners.”",
    app: "Volunteer hours",
    meta: "Tutor view",
    body: (
      <div className={s.stagger}>
        <div className="flex items-end justify-between gap-3 pb-2">
          <div>
            <p className={s.bigNum}>12.5</p>
            <p className="mt-1 text-[12.5px] text-[#6b736e]">verified hours</p>
          </div>
          <span className={cn(s.request, "bg-white! text-ink! ring-1 ring-ink/15")}>
            <Printer className="size-3.5" /> Print record
          </span>
        </div>
        <HourRow when="Thu, Oct 2" who="Leo · 45 min" chip={<span className={cn(s.chip, s.chipOk)}>Verified</span>} />
        <HourRow when="Sat, Sep 27" who="Ava · 30 min" chip={<span className={cn(s.chip, s.chipMuted)}>Confirmed</span>} />
        <HourRow when="Tue, Sep 23" who="Leo · 45 min" chip={<span className={cn(s.chip, s.chipMuted)}>Logged</span>} />
      </div>
    ),
  },
];

function TutorRow({ name, sub, chip }: { name: string; sub: string; chip: ReactNode }) {
  return (
    <div className={s.row}>
      <Avatar name={name} size={34} />
      <div className={s.rowMain}>
        <p className={s.rowTitle}>{name}</p>
        <p className={s.rowSub}>{sub}</p>
      </div>
      {chip}
    </div>
  );
}

function HourRow({ when, who, chip }: { when: string; who: string; chip: ReactNode }) {
  return (
    <div className={s.row}>
      <div className={s.rowMain}>
        <p className={s.rowTitle}>{when}</p>
        <p className={s.rowSub}>{who}</p>
      </div>
      {chip}
    </div>
  );
}

export function RoleSwitcher() {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const reduced = useReducedMotion();
  const active = useActive(ref, 0.35);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(false); // once someone chooses a tab, stop rotating
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const role = ROLES[i];
  const rotating = !reduced && !picked;
  const held = paused || hover || !active;
  const typed = useTyped(role.wants, active && !reduced, 60);
  const shown = reduced ? role.wants.length : typed;
  const typing = shown < role.wants.length;
  // Show the result before the last few words finish, so the window is never blank for long.
  const ready = shown >= role.wants.length * 0.7;

  function choose(n: number, focus = false) {
    setI((n + ROLES.length) % ROLES.length);
    setPicked(true);
    if (focus) tabs.current[(n + ROLES.length) % ROLES.length]?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowRight") choose(i + 1, true);
    else if (e.key === "ArrowLeft") choose(i - 1, true);
    else if (e.key === "Home") choose(0, true);
    else if (e.key === "End") choose(ROLES.length - 1, true);
    else return;
    e.preventDefault();
  }

  return (
    <div ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={s.tabsRow}>
        <div role="tablist" aria-label="Who it’s for" className="flex flex-wrap justify-center gap-1.5 sm:gap-2.5">
          {ROLES.map((r, n) => {
            const Icon = r.icon;
            const on = n === i;
            return (
              <button
                key={r.id}
                ref={(el) => {
                  tabs.current[n] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${r.id}`}
                aria-selected={on}
                aria-controls={`${id}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => choose(n)}
                onKeyDown={onKey}
                className={s.tab}
              >
                <Icon className="size-4" />
                {r.tab}
                {on && rotating && (
                  <span
                    key={`${r.id}-${i}`}
                    className={s.tabProg}
                    data-run=""
                    data-paused={held || undefined}
                    style={{ ["--rot-ms" as string]: `${ROTATE_MS}ms` }}
                    onAnimationEnd={() => setI((n + 1) % ROLES.length)}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
        {rotating && (
          <button
            type="button"
            className={s.pauseBtn}
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Resume rotating examples" : "Pause rotating examples"}
            aria-pressed={paused}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
        )}
      </div>

      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${role.id}`} className={cn("lm-sky lm-sky-dusk", s.stage)}>
        <div key={role.id} className={cn(s.stageHead, !reduced && s.swap)}>
          <p className={s.kick}>{role.kick}</p>
          <h3 className={s.how}>{role.how}</h3>
          <p className={s.howSub}>{role.sub}</p>
        </div>
        <div className={s.stageGrid}>
          <div className={cn("lm-glass", s.say)}>
            <div className={s.sayHead}>
              <LogoMark className="size-4 flex-none" inverted />
              {role.tab.replace(/s$/, "")} wants
              <span className="lm-wave" data-idle={!typing || undefined} aria-hidden>
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            <p className="sr-only">{role.wants}</p>
            <p className={cn(s.sayText, typing && s.caret)} aria-hidden>
              {role.wants.slice(0, shown)}
            </p>
          </div>
          <div className={s.arrow} aria-hidden>
            <ArrowRight className="size-4" />
          </div>
          <div className={cn(s.win, s.out)}>
            <div className={s.winBar}>
              <span className={s.tl} aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span className={s.winApp}>
                <LogoMark className="size-4" /> {role.app}
              </span>
              <span className={s.winMeta}>
                <span className="max-sm:hidden">{role.meta} · </span>Example
              </span>
            </div>
            <div className={s.outBody}>
              {ready ? (
                <div key={role.id}>{role.body}</div>
              ) : (
                <div className={s.shimmer} aria-hidden>
                  <i style={{ width: "64%" }} />
                  <i style={{ width: "86%" }} />
                  <i style={{ width: "72%" }} />
                  <i style={{ width: "58%" }} />
                </div>
              )}
              {ready && (
                <p className="mt-3 flex items-center gap-1.5 border-t border-[#f0eee7] pt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#8a918c]">
                  <Check className="size-3" /> Illustrative — names and numbers are examples
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
