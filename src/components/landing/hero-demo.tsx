"use client";
import { useRef, useState } from "react";
import { Check, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import s from "./landing.module.css";
import { useActive, useReducedMotion, useSteps } from "./use-demo";

/**
 * The hero's looping example: a student's questionnaire answers turn into a
 * matched tutor and a lesson request. Every name and score is illustrative and
 * the window says EXAMPLE; tutors appear as first name + last initial, as they
 * do in the real app.
 */
const SCENARIOS = [
  {
    answers: ["Clarinet", "Developing", "All-District", "Thu evenings"],
    tutor: "Maya R.",
    sub: "11th grade · Clarinet · All-District band",
    score: 94,
    reasons: ["Plays clarinet — your exact instrument", "Wants to teach developing players", "Free Thursday evenings, like you", "Strong at audition prep"],
    slot: ["Thu", "7:00 PM · 45 min"],
  },
  {
    answers: ["Trumpet", "Intermediate", "High notes", "Sat mornings"],
    tutor: "Jordan T.",
    sub: "10th grade · Trumpet · Wind ensemble",
    score: 91,
    reasons: ["Plays trumpet — your exact instrument", "Focuses on tone and range", "Free Saturday mornings", "Likes upbeat, step-by-step lessons"],
    slot: ["Sat", "10:00 AM · 30 min"],
  },
  {
    answers: ["Violin", "Beginner", "Note reading", "Weeknights"],
    tutor: "Priya S.",
    sub: "12th grade · Violin · Chamber orchestra",
    score: 96,
    reasons: ["Plays violin — your exact instrument", "Loves teaching brand-new players", "Free Tuesday and Wednesday evenings", "Patient with note reading"],
    slot: ["Wed", "6:30 PM · 30 min"],
  },
];

// 0 pause · 1–4 answers · 5 searching · 6 tutor · 7–10 reasons · 11 time · 12 sent (hold)
const STEPS = [500, 420, 420, 420, 650, 1100, 650, 560, 560, 560, 750, 1100, 3400];
const FINAL = STEPS.length;

export function HeroDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const active = useActive(ref);
  const [i, setI] = useState(0);
  const [stepNow] = useSteps(STEPS, active && !reduced, i, () => setI((n) => (n + 1) % SCENARIOS.length));
  const step = reduced ? FINAL : stepNow;
  const sc = SCENARIOS[reduced ? 0 : i];
  const sent = step >= 12;

  return (
    <div ref={ref} className={s.heroDemo}>
      <p className="sr-only">
        Example: a clarinet student’s answers are matched with a high school clarinet tutor who is free at the same time, and a Thursday lesson
        request is sent.
      </p>
      <div aria-hidden>
        <div className={cn("lm-glass", s.pill)}>
          <LogoMark className="size-[22px] flex-none" inverted />
          <span className="lm-wave" data-idle={sent || undefined}>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className={s.pillAnswers}>
            {sc.answers.map((a, n) => step > n && <span key={`${i}-${a}`} className={cn(s.answer, !reduced && s.pop)}>{a}</span>)}
          </span>
          <span className={s.pillState} data-done={sent || undefined}>
            {sent ? "MATCHED" : step >= 5 ? "MATCHING" : "YOUR ANSWERS"}
          </span>
        </div>
        <div className={s.win}>
          <div className={cn(s.winBar, s.winBarUnder)}>
            <span className={s.tl}>
              <i />
              <i />
              <i />
            </span>
            <span className={s.winApp}>Your matches</span>
            <span className={s.winMeta}>Example</span>
          </div>
          <div className={s.matchBody}>
            {step < 5 && (
              <div className={s.shimmer}>
                <i style={{ width: "62%" }} />
                <i style={{ width: "88%" }} />
                <i style={{ width: "74%" }} />
              </div>
            )}
            {step === 5 && (
              <div className={s.fadeUp}>
                <p className={cn(s.searching, s.caret)}>Finding tutors who play {sc.answers[0].toLowerCase()}</p>
                <div className={s.shimmer}>
                  <i style={{ width: "70%" }} />
                  <i style={{ width: "52%" }} />
                </div>
              </div>
            )}
            {step >= 6 && (
              <>
                <div key={`t${i}`} className={cn(s.tutorRow, !reduced && s.fadeUp)}>
                  <Avatar name={sc.tutor} size={44} />
                  <div className="min-w-0">
                    <p className={s.tutorName}>{sc.tutor}</p>
                    <p className={s.tutorSub}>{sc.sub}</p>
                  </div>
                  <span className={cn(s.chip, s.chipOk, s.score, !reduced && s.pop)}>Great match · {sc.score}</span>
                </div>
                <ul className={s.reasons}>
                  {sc.reasons.map(
                    (r, n) =>
                      step >= 7 + n && (
                        <li key={`${i}-${r}`} className={cn(!reduced && s.fadeUp)}>
                          <Check className={cn(s.tick, "size-3.5 translate-y-0.5")} strokeWidth={2.5} />
                          <span className={cn(!reduced && s.hl)}>{r}</span>
                        </li>
                      ),
                  )}
                </ul>
                {step >= 11 && (
                  <div className={cn(s.slotRow, !reduced && s.fadeUp)}>
                    <span className={s.slot}>
                      <Video className="mr-1.5 inline size-3.5 -translate-y-px" />
                      <b>{sc.slot[0]}</b> · {sc.slot[1]} · Google Meet
                    </span>
                    <span className={cn(s.request, sent && !reduced && s.pop)} data-sent={sent || undefined}>
                      {sent ? (
                        <>
                          <Check className="size-3.5" strokeWidth={3} /> Request sent
                        </>
                      ) : (
                        "Request lesson"
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
