"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { BadgeCheck, CircleAlert, Clock, X } from "lucide-react";
import { ackAttendanceVerdicts, answerAttendance } from "@/app/actions/lessons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { formatDate, formatTime } from "@/lib/time";
import { cn } from "@/lib/cn";

export interface AttendancePrompt {
  session_id: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  subject_name: string;
  tutor_name: string;
  tutor_avatar: string | null;
  student_name: string;
  tutor_logged: boolean;
}

export interface AttendanceVerdict {
  session_id: string;
  start_at: string;
  duration_minutes: number;
  subject_name: string;
  student_name: string;
  attendance: string;
  status: string;
  tutor_joined: boolean;
  answered_at: string;
}

const LATER_KEY = "tfac-checkin-later";

function readLater(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(LATER_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * Family side: after a lesson ends, the next visit asks "Was <tutor> there?".
 * One lesson at a time, in a modal that can be put off for this visit only.
 * No email is involved.
 */
export function AttendanceCheckIn({ prompts, isStudent }: { prompts: AttendancePrompt[]; isStudent: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [later, setLater] = useState<string[] | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const [choice, setChoice] = useState<null | "yes" | "no">(null);
  const [attest, setAttest] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => setLater(readLater()), []);
  const queue = later === null ? [] : prompts.filter((p) => !later.includes(p.session_id) && !answered.includes(p.session_id));
  const p = queue[0];

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if ((p || thanks) && !d.open) d.showModal();
    if (!p && !thanks && d.open) d.close();
  }, [p, thanks]);

  const reset = () => {
    setChoice(null);
    setAttest(false);
    setNote("");
    setError(null);
  };
  const putOff = () => {
    const ids = [...(later ?? []), ...queue.map((q) => q.session_id)];
    try {
      sessionStorage.setItem(LATER_KEY, JSON.stringify(ids));
    } catch {}
    setLater(ids);
    setThanks(null);
    reset();
  };
  const submit = () =>
    start(async () => {
      if (!p || !choice) return;
      const r = await answerAttendance({ sessionId: p.session_id, present: choice === "yes", attest, note: note || undefined });
      if (!r?.ok) return setError(r?.error.message ?? "Something went wrong. Please try again.");
      setAnswered((a) => [...a, p.session_id]);
      setThanks(r.message ?? "Thanks!");
      reset();
    });

  // Answering refreshes the page and empties `prompts`; keep the thank-you on screen until it's closed.
  if (!prompts.length && !thanks) return null;
  const you = isStudent ? "you" : p?.student_name;

  return (
    <dialog
      ref={ref}
      aria-labelledby="checkin-title"
      onCancel={(e) => {
        e.preventDefault();
        putOff();
      }}
      className="m-auto w-[min(92vw,30rem)] rounded-[28px] border border-ink/10 bg-cream p-0 text-ink shadow-pop backdrop:bg-ink/40 backdrop:backdrop-blur-sm open:animate-rise"
    >
      {thanks && !p ? (
        <div className="p-6 text-center sm:p-8">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-mint text-pine-800">
            <BadgeCheck className="size-6" />
          </span>
          <h2 id="checkin-title" className="display mt-4 text-3xl">
            All <em>caught up</em>
          </h2>
          <p className="mt-2 text-sm text-ink-2">{thanks}</p>
          <Button className="mt-6" onClick={() => setThanks(null)}>
            Done
          </Button>
        </div>
      ) : p ? (
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow">Lesson check-in{queue.length > 1 ? ` · 1 of ${queue.length}` : ""}</p>
            <button type="button" onClick={putOff} className="-m-1 rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink" aria-label="Ask me later">
              <X className="size-4" />
            </button>
          </div>
          {thanks && <p className="mt-3 rounded-xl bg-pine-50 px-3 py-2 text-[13px] text-pine-900">{thanks}</p>}
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={p.tutor_name} path={p.tutor_avatar} size={48} />
            <div className="min-w-0">
              <h2 id="checkin-title" className="display text-[28px] leading-tight">
                Was <em>{p.tutor_name}</em> there?
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-muted">
                <Clock className="size-3.5" />
                {p.subject_name} · {formatDate(p.start_at)}, {formatTime(p.start_at)} ET · {p.duration_minutes} min
              </p>
            </div>
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
            Did {you} have this lesson with {p.tutor_name}? Your answer decides whether it counts toward their volunteer hours.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Was the tutor there?">
            {(["yes", "no"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={choice === c}
                onClick={() => {
                  setChoice(c);
                  setError(null);
                }}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-left text-[14px] font-semibold transition",
                  choice === c ? (c === "yes" ? "border-pine-700 bg-pine-50 text-pine-900" : "border-clay-700 bg-clay-50 text-clay-800") : "border-ink/12 bg-white/70 hover:bg-white",
                )}
              >
                {c === "yes" ? "Yes, they were there" : "No, they weren’t"}
              </button>
            ))}
          </div>

          {choice === "no" && (
            <div className="mt-3 animate-fade">
              <label htmlFor="checkin-note" className="text-[13px] font-medium">
                What happened? <span className="font-normal text-faint">Optional</span>
              </label>
              <Textarea id="checkin-note" className="mt-1.5 min-h-16" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. They never joined the Meet." />
              <p className="mt-1.5 text-[12.5px] text-muted">If anything made {isStudent ? "you" : "your student"} uncomfortable, please also use “Report a concern”.</p>
            </div>
          )}

          {choice && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-paper-2/70 p-3 text-[13px] leading-snug text-ink-2 animate-fade">
              <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 size-4 accent-pine-700" />
              <span>My answer is truthful. I understand it affects a volunteer’s official hours record.</span>
            </label>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-clay-700">
              {error}
            </p>
          )}
          <div className="mt-5 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={putOff}>
              Ask me later
            </Button>
            <Button size="sm" variant={choice === "no" ? "danger" : "primary"} disabled={!choice || !attest} pending={pending} onClick={submit}>
              Submit answer
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * Tutor side: what their students said. "You're good to go" when a student
 * verified the lesson; "said you weren't there" when they didn't.
 */
export function AttendanceVerdicts({ verdicts }: { verdicts: AttendanceVerdict[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const shown = verdicts.filter((v) => !hidden.includes(v.session_id));
  if (!shown.length) return null;
  const dismiss = (ids: string[]) =>
    start(async () => {
      setHidden((h) => [...h, ...ids]);
      await ackAttendanceVerdicts(ids);
    });

  return (
    <section aria-label="What your students said" className="mb-8 space-y-3">
      {shown.map((v) => {
        const present = v.attendance === "present";
        const when = `${v.subject_name} lesson on ${formatDate(v.start_at)} at ${formatTime(v.start_at)}`;
        return (
          <article
            key={v.session_id}
            className={cn(
              "flex animate-rise gap-4 rounded-[22px] border p-4 shadow-card sm:p-5",
              present ? "border-pine-200 bg-pine-50" : "border-clay-500/30 bg-clay-50",
            )}
          >
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", present ? "bg-mint text-pine-800" : "bg-clay-100 text-clay-800")}>
              {present ? <BadgeCheck className="size-5" /> : <CircleAlert className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              {present ? (
                <>
                  <p className="display text-[22px] leading-tight text-pine-900">
                    {v.status === "scheduled" ? "Your student confirmed you were there" : "You’re good to go — your hours have been verified"}
                  </p>
                  <p className="mt-1 text-[14px] text-pine-900/80">
                    {v.status === "scheduled"
                      ? `${v.student_name} said you were at the ${when}. Log the lesson under Lessons to add its ${v.duration_minutes} minutes.`
                      : `${v.student_name} verified you were at the ${when}. ${v.duration_minutes} minutes are added to your dashboard; the partner nonprofit certifies them in its weekly review.`}
                  </p>
                </>
              ) : (
                <>
                  <p className="display text-[22px] leading-tight text-clay-800">Your student said you weren’t there</p>
                  <p className="mt-1 text-[14px] text-clay-800/90">
                    {v.student_name} said you weren’t at the {when}, so these hours won’t count. Please only log lessons that really happened.
                    {v.tutor_joined ? " The site recorded that you opened this lesson, and the program team can see that when they review it." : " If this is a mistake, the program team will review it."}
                  </p>
                </>
              )}
              <Button size="sm" variant={present ? "secondary" : "ghost"} className="mt-3" pending={pending} onClick={() => dismiss([v.session_id])}>
                Got it
              </Button>
            </div>
          </article>
        );
      })}
      {shown.length > 2 && (
        <Button size="sm" variant="ghost" pending={pending} onClick={() => dismiss(shown.map((v) => v.session_id))}>
          Dismiss all
        </Button>
      )}
    </section>
  );
}
