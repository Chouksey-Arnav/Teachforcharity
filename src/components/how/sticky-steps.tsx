"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, CalendarCheck2, Check, Music2, ShieldCheck, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Win } from "./win";
import { MusicDust } from "./music-dust";
import { Tilt } from "./tilt";
import { useActive, useReducedMotion } from "@/components/landing/use-demo";
import s from "./how.module.css";

const HEADER = 72;
const STICKY_MQ = "(min-width: 1024px) and (min-height: 640px)";

const i = (n: number) => ({ "--i": n }) as CSSProperties;
const d = (sec: number) => ({ "--d": `${sec}s` }) as CSSProperties;

function Tick() {
  return (
    <span className={s.check}>
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

/** A ring that turns into a tick `at` seconds after the window appears. */
function TickLater({ at }: { at: number }) {
  return (
    <span className={s.tickSlot}>
      <span className={s.pending} />
      <span className={s.check} style={d(at)}>
        <Check className="size-3" strokeWidth={3} />
      </span>
    </span>
  );
}

function SignupScreen() {
  return (
    <Win title="Sign up">
      <div className={cn(s.well, s.row, s.item)} style={i(0)}>
        <span className="text-faint">Student</span>
        <span className="font-semibold">Leo, 7th grade</span>
        <span className={cn(s.badge, s.badgeGlow, "ml-auto")}>Added by a parent</span>
      </div>
      <div className={cn(s.well, "grid gap-3")}>
        <div className={cn(s.row, s.item)} style={i(1)}>
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-brass-100 text-brass-800">
            <Music2 className="size-4" />
          </span>
          <div>
            <p className="font-semibold">What Leo plays</p>
            <p className="text-[12px] text-faint">Instrument comes first. Always.</p>
          </div>
        </div>
        <div className={cn(s.chips, s.item)} style={i(2)}>
          <span className={cn(s.chip, s.chipOn)}>Clarinet</span>
          <span className={s.chip}>Beginner</span>
          <span className={cn(s.chip, s.chipOn)}>Developing</span>
          <span className={s.chip}>Intermediate</span>
        </div>
        <p className={cn(s.label, s.item)} style={i(3)}>
          Goals
        </p>
        <div className={cn(s.chips, s.item)} style={i(3)}>
          <span className={cn(s.chip, s.chipOn)}>Audition prep</span>
          <span className={cn(s.chip, s.chipOn)}>Reading music</span>
          <span className={cn(s.chip, s.chipAdd)}>+ Add a goal</span>
        </div>
        <p className={cn(s.label, s.item)} style={i(4)}>
          Usually free
        </p>
        <div className={cn(s.chips, s.item)} style={i(4)}>
          <span className={cn(s.chip, s.chipOn)}>Thu evening</span>
          <span className={cn(s.chip, s.chipOn)}>Sat morning</span>
          <span className={cn(s.chip, s.chipAdd)}>+ Add a time</span>
        </div>
      </div>
      <div className={cn(s.well, s.row, s.item, "border-dashed")} style={i(5)}>
        <ShieldCheck className="size-4 text-pine-700" />
        <span className="font-semibold">Parent consent</span>
        <span className={cn(s.badge, s.badgeOk, "ml-auto")}>Signed</span>
      </div>
    </Win>
  );
}

function MatchingScreen() {
  const lines: [string, number][] = [
    ["Finding tutors who play clarinet", 0.5],
    ["Checking which levels each tutor wants to teach", 1.2],
    ["Comparing your free times", 1.9],
    ["Ranking by goals, learning style and fair load", 2.6],
  ];
  return (
    <Win title="Matches">
      <div className={cn(s.well, "grid gap-3")}>
        {lines.map(([t, at], n) => (
          <div key={t} className={cn(s.row, s.item)} style={i(n)}>
            <TickLater at={at} />
            <span>{t}</span>
          </div>
        ))}
        <div className={cn(s.row, s.later, "mt-1 rounded-xl bg-card p-3 ring-1 ring-line")} style={d(3.1)}>
          <Avatar name="Maya R" size={30} />
          <span className="font-semibold">3 tutors fit Leo</span>
          <span className={cn(s.badge, s.badgeOk, "ml-auto")}>Ready</span>
        </div>
      </div>
      <div className={cn(s.well, s.item, "text-[12.5px] leading-relaxed text-ink-2")} style={i(5)}>
        <strong className="text-ink">The best fit, not the oldest player.</strong> A patient tutor who wants beginners beats a senior who doesn’t.
      </div>
    </Win>
  );
}

function RequestScreen() {
  return (
    <Win title="Lessons">
      <div className={cn(s.well, "grid gap-3")}>
        <div className={cn(s.row, s.item)} style={i(0)}>
          <Avatar name="Maya R" size={34} />
          <div className="min-w-0">
            <p className="font-semibold">Maya R.</p>
            <p className="truncate text-[12px] text-faint">11th grade · Clarinet · All-District band</p>
          </div>
          <span className={cn(s.ring, "ml-auto")} />
          <div className="leading-tight">
            <p className="font-semibold">94</p>
            <p className="text-[11px] text-pine-700">Great match</p>
          </div>
        </div>
        <div className={cn(s.row, s.item, "rounded-xl bg-card px-3 py-2.5 ring-1 ring-line")} style={i(1)}>
          <CalendarCheck2 className="size-4 text-brass-700" />
          <span>
            <b>Thursday, 7:00 PM</b> · 45 min · weekly
          </span>
        </div>
      </div>
      <div className={cn(s.well, s.rowList, "py-1")}>
        {[
          ["Leo’s family requested Thursday", "Sent"],
          ["Maya accepted the time", "Booked"],
          ["Calendar invite emailed to both", "Sent"],
          ["Reminder the day before", "Wed"],
        ].map(([t, b], n) => (
          <div key={t} className={cn(s.row, s.item)} style={i(n + 2)}>
            {n < 3 ? <Tick /> : <span className={s.pending} />}
            <span>{t}</span>
            <span className={cn(s.badge, n < 3 && s.badgeOk, "ml-auto")}>{b}</span>
          </div>
        ))}
      </div>
    </Win>
  );
}

function LessonScreen() {
  return (
    <Win title="Hours">
      <div className={cn(s.well, s.row, s.item)} style={i(0)}>
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-pine-100 text-pine-800">
          <Video className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Thursday’s lesson</p>
          <p className="text-[12px] text-faint">Join appears 15 minutes before</p>
        </div>
        <span className="ml-auto rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-cream">Join on Meet</span>
      </div>
      <div className={cn(s.well, s.rowList, "py-1")}>
        {[
          ["Oct 1 · 45 min", "Verified", s.badgeOk],
          ["Oct 8 · 45 min", "Confirmed", s.badgeGlow],
          ["Oct 15 · 45 min", "Logged", ""],
          ["Oct 22 · 45 min", "Booked", ""],
        ].map(([t, b, tone], n) => (
          <div key={t} className={cn(s.row, s.item)} style={i(n + 1)}>
            <span className="font-medium">Leo × Maya R.</span>
            <span className="text-faint">{t}</span>
            <span className={cn(s.badge, tone, "ml-auto")}>{b}</span>
          </div>
        ))}
      </div>
      <p className={cn(s.item, "px-1 text-[12px] leading-relaxed text-muted")} style={i(5)}>
        Booked → logged by the tutor → confirmed by the family → verified by our nonprofit partner. Never recorded.
      </p>
    </Win>
  );
}

const STEPS: { title: string; body: string; screen: ReactNode }[] = [
  {
    title: "Sign up, and a parent says yes",
    body: "A parent creates the account, adds their child and answers a short questionnaire: instrument, level, goals and free times. Nothing unlocks until they sign consent.",
    screen: <SignupScreen />,
  },
  {
    title: "Get matched",
    body: "Instrument first, then level, schedule, goals, learning style and the music you love. You see a ranked list with the reasons behind every match.",
    screen: <MatchingScreen />,
  },
  {
    title: "Request a time",
    body: "Pick a time and the tutor accepts, declines or suggests another. Everyone gets an email, a calendar invite and a reminder the day before.",
    screen: <RequestScreen />,
  },
  {
    title: "Learn on Google Meet",
    body: "Lessons happen on the tutor’s own Meet link, with a parent nearby. Afterward the family confirms it happened — that’s what makes the hours count.",
    screen: <LessonScreen />,
  },
];

/**
 * RaisedHand's "How it works": the steps stay pinned while you scroll and the
 * window beside them changes with each one. Below 1024px (or on short screens)
 * it's an ordinary list you tap through instead.
 */
export function StickySteps() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  const screens = useRef<HTMLDivElement>(null);
  const [manual, setManual] = useState(false);
  const reduced = useReducedMotion();
  const showing = useActive(screens, 0.4);

  // Phones don't pin, so the steps play through on their own while the
  // window is on screen — until someone taps a step.
  useEffect(() => {
    if (pinned || manual || reduced || !showing) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % STEPS.length), 4800);
    return () => window.clearInterval(id);
  }, [pinned, manual, reduced, showing]);

  useEffect(() => {
    const mq = window.matchMedia(STICKY_MQ);
    const update = () => setPinned(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = track.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const travel = r.height - (window.innerHeight - HEADER);
      const p = Math.min(0.999, Math.max(0, (HEADER - r.top) / travel));
      setActive(Math.floor(p * STEPS.length));
      // How far through the current step, for the ring around its number.
      el.style.setProperty("--prog", String((p * STEPS.length) % 1));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pinned]);

  const go = (n: number) => {
    const el = track.current;
    if (!pinned || !el) {
      setManual(true);
      return setActive(n);
    }
    const r = el.getBoundingClientRect();
    const travel = r.height - (window.innerHeight - HEADER);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: window.scrollY + r.top - HEADER + (travel * (n + 0.5)) / STEPS.length, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div ref={track} className={s.track}>
      <div className={cn("lm-wrap", s.stage)}>
        <div>
          <p className="lm-eyebrow">Four steps</p>
          <h2 className={cn("lm-h2 mt-[18px] text-ink", s.accent)}>
            How it <em>works.</em>
          </h2>
          <ol className={s.steps}>
            {STEPS.map((st, n) => (
              <li key={st.title}>
                <button
                  type="button"
                  className={s.step}
                  aria-current={n === active ? "step" : undefined}
                  data-done={n < active || undefined}
                  onClick={() => go(n)}
                >
                  <span className={s.num}>{n < active ? <Check className="size-3.5" strokeWidth={2.5} /> : n + 1}</span>
                  <span>
                    <span className={cn(s.stepTitle, "block")}>{st.title}</span>
                    <span className={cn(s.stepBody, "block")}>{st.body}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
            <LinkButton href="/signup" size="lg">
              Get started — it’s free <ArrowRight className="size-4" />
            </LinkButton>
          </div>
          <p className={cn("lm-micro", s.scrollHint)}>{active < STEPS.length - 1 ? "Scroll to continue" : "That’s it. Four steps."}</p>
        </div>
        <div ref={screens} className={s.screens} aria-hidden>
          <MusicDust variant="step" index={active} className={s.stepDust} />
          <p className={s.stepTag}>
            <span className="lm-micro">
              Step <b key={active}>{String(active + 1).padStart(2, "0")}</b> / 04
            </span>
            <span key={`t${active}`}>{STEPS[active].title}</span>
          </p>
          {STEPS.map((st, n) => (
            <div key={st.title} className={s.screen} data-on={n === active || undefined} data-past={n < active || undefined}>
              <Tilt>{st.screen}</Tilt>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
