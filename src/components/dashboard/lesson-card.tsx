"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRightLeft, BadgeCheck, CalendarClock, CheckCircle2, ChevronRight, Clock, ListChecks, MessageCircle, Repeat, Video, X, XCircle, Zap } from "lucide-react";
import type { MySession } from "@/lib/data";
import { formatDate, formatDay, formatTime, formatWhen, easternDateOffset, easternParts } from "@/lib/time";
import { lessonBadge } from "@/lib/lesson-state";
import type { OpenSlot } from "@/lib/slots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/field";
import { DateTimeFields, type DateTimeValue } from "@/components/forms/date-time-fields";
import { TimePicker } from "@/components/forms/time-picker";
import { PracticeComposer, PracticeFields, draftHasContent, emptyDraft, type PracticeDraft } from "@/components/dashboard/practice-fields";
import { draftProblem } from "@/lib/practice";
import { answerAttendance, answerMove, cancelLesson, getLessonSlots, logLesson, moveLesson, respondLesson, type LessonSlots } from "@/app/actions/lessons";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/cn";

type Panel = null | "counter" | "move" | "decline" | "cancel" | "log-yes" | "log-no" | "answer-yes" | "answer-no" | "join" | "practice";

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function LessonCard({ s, focus }: { s: MySession; focus?: boolean }) {
  const now = useNow();
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionState>(null);
  const [attest, setAttest] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();

  const start_ = new Date(s.start_at).getTime();
  const end = new Date(s.end_at).getTime();
  const isTutor = s.my_side === "tutor";
  const other = isTutor ? `${s.student_name} (${s.student_grade}th grade)` : s.tutor_name;
  const canJoin = s.status === "scheduled" && now >= start_ - 15 * 60000 && now <= end + 15 * 60000;
  const started = now >= start_;
  const ended = now >= end;
  // The family's check-in: open from the moment the lesson ends until they answer (30 days).
  const canAnswer = !isTutor && ended && !s.family_attendance && (s.status === "scheduled" || s.status === "completed") && now - end < 30 * 86400000;
  const needsAttest = panel === "log-yes" || panel === "log-no" || panel === "answer-yes" || panel === "answer-no";

  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r?.ok) {
        setPanel(null);
        setNote("");
        setAttest(false);
        setDraft(emptyDraft());
      }
    });

  const d = new Date(s.start_at);
  const month = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short" }).format(d);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(d);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);

  const weeksPending = s.pending_weeks ?? 0;
  const isWeekly = weeksPending > 1;
  const laterWeeks = s.series_id && s.series_size && s.series_index ? s.series_size - s.series_index : 0;
  const [cancelRest, setCancelRest] = useState(false);
  const [draft, setDraft] = useState<PracticeDraft>(emptyDraft);
  const draftIssue = draftHasContent(draft) ? draftProblem(draft.tasks, draft.note) : null;
  // Practice can be added to a lesson that happened (logged, or confirmed by the student).
  const canAddPractice = isTutor && ["completed", "confirmed", "verified"].includes(s.status);

  const otherFirst = isTutor ? s.student_name : s.tutor_name.split(" ")[0];
  let statusLine: string | null = null;
  if (s.status === "pending") {
    const by = s.respond_by ? formatWhen(s.respond_by) : null;
    statusLine = s.awaiting_me
      ? `${s.proposed_by === "family" ? `${s.student_name} asked for this time` : `${s.tutor_name} suggested this time`}.${by ? ` Please answer by ${by}.` : ""}`
      : `${otherFirst} has until ${by ?? "the lesson time"} to answer. We’ll tell you either way.`;
  }
  const moveAsked = s.status === "scheduled" && Boolean(s.move_start_at);
  const moveForMe = moveAsked && s.move_proposed_by !== s.my_side;
  // Moving is for lessons at least 2 hours away (after that, a message or cancelling is clearer).
  const canMove = s.status === "scheduled" && start_ - now > 2 * 3600000;
  const badge = lessonBadge(s, now);

  return (
    <article
      id={`lesson-${s.id}`}
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-card transition",
        s.awaiting_me ? "border-brass-300" : "border-line",
        focus && "ring-4 ring-brass-300/50",
      )}
    >
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-paper-2 py-2 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{month}</span>
          <span className="display text-3xl leading-none">{day}</span>
          <span className="text-[11px] text-muted">{weekday}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={badge.tone} dot>
              {badge.label}
            </Badge>
            {s.awaiting_me && <Badge tone="brass">Needs you</Badge>}
            {isWeekly && (
              <Badge tone="pine">
                <Repeat className="size-3" aria-hidden /> {weeksPending} weekly lessons
              </Badge>
            )}
            {!isWeekly && s.series_index && s.series_size && s.status !== "pending" && (
              <Badge tone="neutral">
                Week {s.series_index} of {s.series_size}
              </Badge>
            )}
          </div>
          <h3 className="mt-2 text-[15px] font-semibold leading-snug">
            {s.subject_name} with {other}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-muted">
            <Clock className="size-3.5" />
            {isWeekly ? `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(d)}s, ` : ""}
            {formatTime(s.start_at)}–{formatTime(s.end_at)} ET · {s.duration_minutes} min
          </p>
          {isWeekly && s.pending_until && (
            <p className="mt-0.5 text-[13px] text-muted">
              {formatDate(s.start_at).replace(/, \d{4}$/, "")} to {formatDate(s.pending_until).replace(/, \d{4}$/, "")} · answering covers every week
            </p>
          )}
          {statusLine && <p className="mt-2 text-[13.5px] text-ink-2">{statusLine}</p>}
          {moveAsked && s.move_start_at && (
            <p className={cn("mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[13.5px]", moveForMe ? "bg-brass-100/70 text-ink" : "bg-paper-2 text-ink-2")}>
              <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {moveForMe ? `${otherFirst} asked to move this to ` : "You asked to move this to "}
                <strong className="font-semibold">{formatWhen(s.move_start_at)}</strong>.{" "}
                {moveForMe
                  ? `It stays at the old time unless you say yes${s.move_respond_by ? ` by ${formatWhen(s.move_respond_by)}` : ""}.`
                  : `It stays at the old time until ${otherFirst} says yes.`}
                {s.move_note && <span className="mt-1 block text-muted">“{s.move_note}”</span>}
              </span>
            </p>
          )}
          {s.request_note && s.status === "pending" && <p className="mt-1.5 rounded-lg bg-paper-2 px-3 py-2 text-[13px] text-ink-2">“{s.request_note}”</p>}
          {s.status === "declined" && s.decline_reason && <p className="mt-1.5 text-[13px] text-muted">Note: “{s.decline_reason}”</p>}
          {s.status === "cancelled" && s.cancel_reason && <p className="mt-1.5 text-[13px] text-muted">Reason: “{s.cancel_reason}”</p>}
          {canAnswer && <p className="mt-2 text-[13.5px] text-ink-2">Was {s.tutor_name} there? Your answer decides whether this lesson counts toward their hours.</p>}
          {!isTutor && s.status === "scheduled" && s.family_attendance && (
            <p className="mt-2 text-[13.5px] text-muted">You said {s.tutor_name} {s.family_attendance === "present" ? "was" : "wasn’t"} there. It’s applied when they log the lesson.</p>
          )}
          {isTutor && s.status === "scheduled" && ended && s.family_attendance === "present" && (
            <p className="mt-2 text-[13.5px] text-pine-800">{s.student_name} already confirmed you were there — log it to add the hours.</p>
          )}
          {s.status === "completed" && isTutor && <p className="mt-2 text-[13.5px] text-muted">Waiting for {s.student_name} to confirm you were there. They’re asked next time they open the site.</p>}
          {s.status === "confirmed" && (
            <p className="mt-2 flex items-center gap-1.5 text-[13.5px] text-pine-800">
              <BadgeCheck className="size-4" /> {isTutor ? `${s.student_name} verified you were there` : "You verified this lesson"} — step 1 of 2. The partner nonprofit certifies the hours weekly.
            </p>
          )}
          {s.status === "verified" && (
            <p className="mt-2 flex items-center gap-1.5 text-[13.5px] text-pine-800">
              <BadgeCheck className="size-4" /> Student-verified and certified{s.verifier_org ? ` by ${s.verifier_org}` : ""}
            </p>
          )}
          {s.status === "disputed" && (
            <p className="mt-2 text-[13.5px] text-clay-800">
              {isTutor ? `${s.student_name} said you weren’t there, so these hours don’t count. Please only log lessons that really happened.` : `You said ${s.tutor_name} wasn’t there.`} The program team is reviewing it.
            </p>
          )}
          {s.status === "rejected" && s.review_note && <p className="mt-2 text-[13.5px] text-clay-800">Not verified: “{s.review_note}”</p>}
          {s.practice_plan && ["completed", "confirmed", "verified", "disputed"].includes(s.status) && (
            <div className="mt-3 rounded-xl bg-paper-2/70 px-3.5 py-2.5 text-[13.5px]">
              <p className="font-semibold">What to practice</p>
              <p className="mt-0.5 whitespace-pre-line text-ink-2">{s.practice_plan}</p>
            </div>
          )}
        </div>
        <div className="hidden shrink-0 sm:block">
          <Avatar name={isTutor ? s.student_name : s.tutor_name} path={isTutor ? null : s.tutor_avatar} size={40} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper/50 px-4 py-3 sm:px-5">
        {s.status === "pending" && s.awaiting_me && (
          <>
            <Button
              size="sm"
              pending={pending && panel === null}
              onClick={() =>
                run(async () => {
                  const r = await respondLesson({ sessionId: s.id, action: "accept" });
                  // Accepting moves the lesson out of "Needs you", which unmounts this card and its message,
                  // so Lessons shows "Booked!" instead (and the card doesn't repeat it if it survives).
                  if (!r?.ok) return r;
                  router.push(`/dashboard/lessons?tab=upcoming&focus=${s.id}&booked=1`);
                  return { ok: true } as ActionState;
                })
              }
            >
              <CheckCircle2 className="size-4" /> Accept
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "counter" ? null : "counter")}>
              <ArrowRightLeft className="size-4" /> Suggest another time
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "decline" ? null : "decline")}>
              Decline
            </Button>
          </>
        )}
        {s.status === "pending" && !s.awaiting_me && (
          <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>
            Withdraw request
          </Button>
        )}
        {moveForMe && (
          <>
            {/* Answering moves the lesson out of "Needs you", unmounting this card, so the confirmation shows at the top of Lessons. */}
            <Button
              size="sm"
              pending={pending && panel === null}
              onClick={() =>
                run(async () => {
                  const r = await answerMove({ sessionId: s.id, accept: true });
                  if (!r?.ok) return r;
                  router.push(`/dashboard/lessons?tab=upcoming&focus=${s.id}&done=moved`);
                  return { ok: true } as ActionState;
                })
              }
            >
              <CheckCircle2 className="size-4" /> Yes, move it
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                run(async () => {
                  const r = await answerMove({ sessionId: s.id, accept: false });
                  if (!r?.ok) return r;
                  router.push(`/dashboard/lessons?tab=upcoming&focus=${s.id}&done=kept`);
                  return { ok: true } as ActionState;
                })
              }
            >
              Keep the old time
            </Button>
          </>
        )}
        {moveAsked && !moveForMe && (
          <Button size="sm" variant="ghost" onClick={() => run(() => answerMove({ sessionId: s.id, accept: false }))}>
            Take back the move
          </Button>
        )}
        {s.status === "scheduled" && (
          <>
            {canJoin ? (
              <Button size="sm" onClick={() => setPanel(panel === "join" ? null : "join")} aria-expanded={panel === "join"}>
                <Video className="size-4" /> Join Google Meet
              </Button>
            ) : (
              !ended && (
                <span className="inline-flex h-8 items-center gap-2 rounded-full border border-dashed border-line-2 px-3.5 text-[13px] text-muted">
                  <Video className="size-4" /> Join opens {formatTime(s.join_opens_at ?? s.start_at)}
                </span>
              )
            )}
            {isTutor && ended && (
              <>
                <Button size="sm" onClick={() => setPanel(panel === "log-yes" ? null : "log-yes")} aria-expanded={panel === "log-yes"}>
                  <CheckCircle2 className="size-4" /> It happened
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "log-no" ? null : "log-no")}>
                  It didn’t happen
                </Button>
              </>
            )}
            {canMove && !moveAsked && (
              <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "move" ? null : "move")} aria-expanded={panel === "move"}>
                <ArrowRightLeft className="size-4" /> Move
              </Button>
            )}
            {!started && (
              <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>
                Cancel lesson
              </Button>
            )}
          </>
        )}
        {canAnswer && (
          <>
            <Button size="sm" onClick={() => setPanel(panel === "answer-yes" ? null : "answer-yes")} aria-expanded={panel === "answer-yes"}>
              <CheckCircle2 className="size-4" /> Yes, they were there
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "answer-no" ? null : "answer-no")} aria-expanded={panel === "answer-no"}>
              <XCircle className="size-4" /> No, they weren’t
            </Button>
          </>
        )}
        {canAddPractice && (
          <Button size="sm" variant={panel === "practice" ? "primary" : "secondary"} onClick={() => setPanel(panel === "practice" ? null : "practice")} aria-expanded={panel === "practice"}>
            <ListChecks className="size-4" /> Add practice
          </Button>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          {s.thread_id && (
            <Link href={`/dashboard/messages/${s.thread_id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-paper-2 hover:text-ink">
              <MessageCircle className="size-4" /> Message
            </Link>
          )}
          {s.status !== "pending" && (
            <Link href={`/dashboard/lessons/${s.id}`} className="inline-flex h-8 items-center gap-0.5 rounded-full px-3 text-[13px] text-muted hover:bg-paper-2 hover:text-ink">
              Details <ChevronRight className="size-4" />
            </Link>
          )}
        </span>
      </div>

      {(panel === "counter" || panel === "move") && (
        <NewTimePanel
          key={panel}
          s={s}
          purpose={panel}
          isWeekly={isWeekly}
          weeks={weeksPending}
          otherFirst={otherFirst}
          onClose={() => setPanel(null)}
          onDone={(code) => router.push(`/dashboard/lessons?focus=${s.id}&done=${code}`)}
        />
      )}

      {panel === "join" && <JoinPanel sessionId={s.id} isTutor={isTutor} studentName={s.student_name} onClose={() => setPanel(null)} />}

      {panel === "practice" && (
        <div className="animate-fade border-t border-line px-4 py-4 sm:px-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Practice for {s.student_name}</p>
            <button type="button" onClick={() => setPanel(null)} className="rounded-full p-1 text-muted hover:bg-paper-2" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <PracticeComposer studentId={s.student_id} studentName={s.student_name} sessionId={s.id} idPrefix={`card-${s.id}`} />
        </div>
      )}

      {panel && panel !== "join" && panel !== "practice" && panel !== "counter" && panel !== "move" && (
        <div className="animate-fade border-t border-line px-4 py-4 sm:px-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {panel === "decline" && (isWeekly ? `Decline all ${weeksPending} weekly lessons` : "Decline this request")}
              {panel === "cancel" && (s.status === "pending" ? (isWeekly ? `Withdraw the request for ${weeksPending} weekly lessons` : "Withdraw this request") : "Cancel this lesson")}
              {panel === "log-yes" && "Log this lesson"}
              {panel === "log-no" && "What happened?"}
              {panel === "answer-yes" && `Confirm ${s.tutor_name} was there`}
              {panel === "answer-no" && `${s.tutor_name} wasn’t there`}
            </p>
            <button type="button" onClick={() => setPanel(null)} className="rounded-full p-1 text-muted hover:bg-paper-2" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {panel === "cancel" && s.status === "scheduled" && start_ - now < 24 * 3600000 && (
            <Notice tone="warning" className="mb-3">
              This lesson is less than 24 hours away. Please also send a quick message so they aren’t waiting.
            </Notice>
          )}
          {panel === "cancel" && s.status === "scheduled" && laterWeeks > 0 && (
            <label className="mb-2 flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={cancelRest} onChange={(e) => setCancelRest(e.target.checked)} className="accent-pine-700" />
              Also cancel the {laterWeeks} later week{laterWeeks === 1 ? "" : "s"} of this series
            </label>
          )}
          {panel === "answer-no" && (
            <p className="mb-2 text-[13px] text-muted">This lesson won’t count toward the tutor’s hours, and the program team will look at it. If something made you uncomfortable, please also use “Report a concern.”</p>
          )}
          {panel === "log-yes" && (
            <div className="rounded-2xl border border-line bg-paper/60 p-4">
              <p className="eyebrow">Homework for {s.student_name}</p>
              <p className="mb-3 mt-1 text-[13px] text-muted">Optional. It goes straight to {s.student_name}’s practice board when you log the lesson.</p>
              <PracticeFields value={draft} onChange={setDraft} studentName={s.student_name} idPrefix={`log-${s.id}`} />
            </div>
          )}
          {panel !== "answer-yes" && (
            <Textarea
              className="mt-3 min-h-16"
              placeholder={panel === "answer-no" ? "Optional: briefly, what happened?" : panel === "log-yes" ? "Optional private note for the program (not shown to the family)" : "Optional note (no contact info)"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
            />
          )}
          {needsAttest && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-paper-2/60 p-3 text-[13px] leading-snug text-ink-2">
              <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 size-4 accent-pine-700" />
              <span>
                {isTutor
                  ? "This log is truthful. I understand false logs can remove me from the program and are reported to the partner verifying my hours."
                  : "My answer is truthful. I understand it affects a volunteer’s official hours record."}
              </span>
            </label>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              Never mind
            </Button>
            <Button
              size="sm"
              variant={panel === "log-yes" || panel === "answer-yes" ? "primary" : "danger"}
              pending={pending}
              disabled={(needsAttest && !attest) || (panel === "log-yes" && Boolean(draftIssue))}
              onClick={() =>
                run(() => {
                  // These move the lesson to another list, which unmounts this card and its message,
                  // so the confirmation is shown at the top of Lessons instead (see JUST_DONE there).
                  const moved = (code: string) => async (r: ActionState) => {
                    if (!r?.ok) return r;
                    router.push(`/dashboard/lessons?focus=${s.id}&done=${code}`);
                    return { ok: true } as ActionState;
                  };
                  if (panel === "decline") return respondLesson({ sessionId: s.id, action: "decline", note }).then(moved("declined"));
                  if (panel === "cancel")
                    return cancelLesson({ sessionId: s.id, reason: note, scope: cancelRest || (s.status === "pending" && isWeekly) ? "rest" : "one" }).then(moved("cancelled"));
                  if (panel === "log-yes")
                    return logLesson({ sessionId: s.id, happened: true, note, attest, studentId: s.student_id, tasks: draft.tasks, daily: draft.daily, practiceNote: draft.note, due: draft.due || undefined });
                  if (panel === "log-no") return logLesson({ sessionId: s.id, happened: false, note, attest });
                  return answerAttendance({ sessionId: s.id, present: panel === "answer-yes", note, attest });
                })
              }
            >
              {panel === "log-yes" ? (draftHasContent(draft) ? "Log lesson & send practice" : "Log lesson") : panel === "decline" ? "Decline" : panel === "cancel" ? "Confirm cancel" : panel === "answer-yes" ? "Verify lesson" : "Submit"}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="px-4 pb-4 sm:px-5">
          {result.ok ? (
            result.message ? <Notice tone="success">{result.message}</Notice> : null
          ) : (
            <Notice tone="danger">{result.error.message}</Notice>
          )}
        </div>
      )}
      <span className="sr-only">{formatDay(s.start_at)}</span>
    </article>
  );
}

/**
 * Pick a new time for a lesson: to suggest another time for a request, or to
 * move a booked one. Shows only times that really work (the tutor's open
 * times, nothing that clashes, enough notice), says before you tap whether it
 * happens straight away or gets asked, and keeps "any time" as a fallback.
 */
function NewTimePanel({
  s,
  purpose,
  isWeekly,
  weeks,
  otherFirst,
  onClose,
  onDone,
}: {
  s: MySession;
  purpose: "counter" | "move";
  isWeekly: boolean;
  weeks: number;
  otherFirst: string;
  onClose: () => void;
  onDone: (code: string) => void;
}) {
  const offered = s.offered_minutes?.length ? s.offered_minutes : [s.duration_minutes];
  const [data, setData] = useState<LessonSlots | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(offered.includes(s.duration_minutes) ? s.duration_minutes : offered[0]);
  const [picked, setPicked] = useState<OpenSlot | null>(null);
  const [manual, setManual] = useState(false);
  const [dt, setDt] = useState<DateTimeValue>(() => {
    const p = easternParts(new Date(s.start_at));
    return { date: p.date, time: "", minutes };
  });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    getLessonSlots({ sessionId: s.id, purpose }).then((r) => {
      if (!live) return;
      if (r?.ok && r.data) setData(r.data);
      else setLoadError(r && !r.ok ? r.error.message : "Couldn’t load open times.");
    });
    return () => {
      live = false;
    };
  }, [s.id, purpose]);

  const slots = data?.byMinutes[minutes] ?? [];
  const choice = manual ? (dt.date && dt.time ? { date: dt.date, time: dt.time, minutes: dt.minutes } : null) : picked ? { date: picked.date, time: picked.time, minutes } : null;
  // Moving one of the tutor's open times, as the family, with a tutor who allows it: it just happens.
  const instant = purpose === "move" && !manual && Boolean(picked) && Boolean(data?.instant) && s.my_side === "family";
  const title =
    purpose === "move"
      ? "Move this lesson"
      : isWeekly
        ? `Suggest a different weekly time (all ${weeks} weeks move)`
        : "Suggest a different time";

  return (
    <div className="animate-fade border-t border-line px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-paper-2" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {offered.length > 1 && (
        <div className="mb-3 flex w-full rounded-full border border-line bg-paper-2/70 p-0.5" role="radiogroup" aria-label="Lesson length">
          {offered.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={minutes === m}
              onClick={() => {
                setMinutes(m);
                setPicked(null);
                setDt((v) => ({ ...v, minutes: m }));
              }}
              className={cn(
                "h-8 flex-1 whitespace-nowrap rounded-full px-3 text-[13px] font-medium tabular-nums transition",
                minutes === m ? "bg-card text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {m} minutes
            </button>
          ))}
        </div>
      )}
      {manual ? (
        <div className="rounded-xl bg-paper-2/50 p-3">
          <p className="mb-3 text-[13px] text-muted">{otherFirst} will be asked whether this time works.</p>
          <DateTimeFields value={dt} onChange={setDt} min={easternDateOffset(0)} max={easternDateOffset(89)} durations={offered} />
        </div>
      ) : loadError ? (
        <Notice tone="warning">{loadError}</Notice>
      ) : !data ? (
        <p className="py-6 text-center text-[13px] text-muted" role="status">
          Finding open times…
        </p>
      ) : slots.length === 0 ? (
        <p className="rounded-xl bg-paper-2/60 px-4 py-4 text-[13px] text-muted">No open times in the next three weeks. Pick any time below instead.</p>
      ) : (
        <TimePicker slots={slots} value={picked} onChange={setPicked} fitsLabel={s.my_side === "family" ? "your" : `${s.student_name}’s`} days={21} />
      )}
      <button type="button" onClick={() => setManual(!manual)} className="mt-3 text-[12.5px] font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
        {manual ? "Back to open times" : "Pick any time instead"}
      </button>
      <Textarea className="mt-3 min-h-14" placeholder="Optional note (no contact info)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
      {choice && (
        <p className="mt-3 rounded-xl border border-pine-200 bg-pine-50/60 px-3.5 py-2.5 text-[13.5px] text-ink-2" aria-live="polite">
          {instant ? (
            <>
              <Zap className="mr-1 inline size-3.5 text-pine-700" aria-hidden />
              Moves right away. {otherFirst} gets an email.
            </>
          ) : purpose === "move" ? (
            `${otherFirst} will be asked. Your lesson stays at the old time until they say yes.`
          ) : (
            `${otherFirst} will be asked whether this new time works.`
          )}
        </p>
      )}
      {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Never mind
        </Button>
        <Button
          size="sm"
          pending={pending}
          disabled={!choice}
          onClick={() =>
            choice &&
            start(async () => {
              setError(null);
              if (purpose === "move") {
                const r = await moveLesson({ sessionId: s.id, ...choice, note });
                if (!r?.ok) return setError(r?.error.message ?? "Something went wrong.");
                return onDone(r.data?.outcome === "moved" ? "moved" : "move-asked");
              }
              const r = await respondLesson({ sessionId: s.id, action: "counter", ...choice, note });
              if (!r?.ok) return setError(r?.error.message ?? "Something went wrong.");
              onDone("countered");
            })
          }
        >
          {instant ? "Move it" : purpose === "move" ? "Ask to move" : "Send new time"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The last step before a lesson: confirm the safety rule, then the form opens
 * the Meet in a new tab. The server hands out the link only inside the lesson
 * window and records the confirmation.
 */
function JoinPanel({ sessionId, isTutor, studentName, onClose }: { sessionId: string; isTutor: boolean; studentName: string; onClose: () => void }) {
  const [ack, setAck] = useState(false);
  return (
    <form
      method="post"
      action={`/dashboard/lessons/${sessionId}/join`}
      target="_blank"
      className="animate-fade space-y-3 border-t border-line px-4 py-4 sm:px-5"
      onSubmit={() => setTimeout(onClose, 500)}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Before you join</p>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-paper-2" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-paper-2/60 p-3 text-sm leading-snug text-ink-2">
        <input type="checkbox" name="ack" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-pine-700" />
        <span>
          {isTutor
            ? `I’m somewhere quiet and appropriate for a lesson with ${studentName}, and I won’t record, screenshot, or share it.`
            : `A parent or guardian is home or nearby and can be reached during this lesson. We won’t record it.`}
        </span>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Keep chat on this site — the Meet chat isn’t monitored, so don’t share contact info there.</p>
        <Button type="submit" size="sm" disabled={!ack}>
          <Video className="size-4" /> Open Google Meet
        </Button>
      </div>
    </form>
  );
}
