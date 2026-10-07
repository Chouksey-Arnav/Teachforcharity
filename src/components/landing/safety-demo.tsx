"use client";
import { useRef, useState, type ReactNode } from "react";
import { CheckCheck, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { MESSAGE_MAX, messageViolation, violationSpans } from "@/lib/moderation";
import { cn } from "@/lib/cn";
import s from "./landing.module.css";
import { useActive, useReducedMotion, useSteps, useTyped } from "./use-demo";

/**
 * Two cards type the same message. On a typical chat app it's delivered; here
 * the real message filter (lib/moderation — the same rules the database
 * enforces) strikes what it would block. Visitors can type their own message.
 */
const SAMPLES = [
  "Great lesson today! Text me at 919-555-0142 so we can practice more.",
  "You should add me on snapchat @mayaplays, it’s easier than this site",
  "My mom can drive you — want to come over to my house on Saturday?",
  "Nice work on the F major scale! Try measures 12–24 slowly this week.",
];

export function SafetyDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const active = useActive(ref);
  const [i, setI] = useState(0);
  const [own, setOwn] = useState<string | null>(null);

  const sample = SAMPLES[i];
  const typed = useTyped(sample, active && !reduced && own === null, 30);
  // After a sample finishes typing, hold so it can be read, then move on.
  const done = reduced || typed >= sample.length;
  useSteps([3800], active && !reduced && own === null && done, `${i}-${done}`, () => done && setI((n) => (n + 1) % SAMPLES.length));

  const text = own ?? sample.slice(0, reduced ? sample.length : typed);
  const finished = own !== null || done;
  const spans = violationSpans(text);
  const reason = finished ? messageViolation(text) : null;

  return (
    <div ref={ref}>
      <div className={s.vsWrap}>
        <div className={s.vsGrid} aria-hidden>
          <article className={cn(s.card, s.cardOther)}>
            <div className={cn(s.cardHead, s.cardHeadOther)}>
              Most chat apps
              <em>Anything goes</em>
            </div>
            <div className={cn(s.cardBody, "text-ink/70")}>
              <span className={cn(!finished && s.caret)}>{text || " "}</span>
            </div>
            <div className={s.cardFoot}>
              <span className={s.footNote}>{finished ? "Delivered privately" : "Typing…"}</span>
              {finished && text && (
                <span className={cn(s.chip, s.chipMuted, !reduced && s.pop)}>
                  <CheckCheck className="size-3" /> Sent
                </span>
              )}
            </div>
          </article>
          <article className={cn(s.card, s.cardOurs)}>
            <div className={cn(s.cardHead, s.cardHeadOurs)}>
              <LogoMark className="size-4" inverted />
              Teach for a Cause
              <em>
                <span className="lm-wave" data-idle={finished || undefined}>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </em>
            </div>
            <div className={s.cardBody}>
              <Marked text={text} spans={spans} caret={!finished} />
            </div>
            <div className={s.cardFoot}>
              <span className={s.footNote}>{!finished ? "Checking as you type…" : reason ? "Not sent" : "Sent · a parent can read it"}</span>
              {finished && text && (
                <span key={`${reason}`} className={cn(s.chip, reason ? s.chipNo : s.chipOk, !reduced && s.pop)}>
                  {reason ? "Blocked" : "Allowed"}
                </span>
              )}
            </div>
          </article>
        </div>
        <span className={s.vsBadge} aria-hidden>
          VS
        </span>
      </div>

      <label className={s.tryIt}>
        <span className="sr-only">Type a message to see whether it would be sent</span>
        <ShieldCheck className="size-[18px] flex-none text-[#1f5446]" aria-hidden />
        <input
          type="text"
          value={own ?? ""}
          maxLength={MESSAGE_MAX}
          placeholder="Try it — type a message a tutor might send"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setOwn(e.target.value === "" ? null : e.target.value)}
          aria-describedby="safety-verdict"
        />
      </label>
      <p id="safety-verdict" aria-live="polite" className={cn("lm-micro", s.tryHint)}>
        {own === null
          ? "Same rules the site enforces · Nothing you type is saved"
          : reason
            ? `For everyone’s safety, messages can’t include ${reason}.`
            : "This one would be sent — and a parent can read it."}
      </p>
    </div>
  );
}

function Marked({ text, spans, caret }: { text: string; spans: { start: number; end: number }[]; caret: boolean }) {
  const parts: ReactNode[] = [];
  let at = 0;
  spans.forEach((sp, n) => {
    if (sp.start > at) parts.push(text.slice(at, sp.start));
    parts.push(
      <span key={n} className={s.bad}>
        {text.slice(sp.start, sp.end)}
      </span>,
    );
    at = sp.end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <span className={cn(caret && s.caret)}>{parts.length ? parts : " "}</span>;
}
