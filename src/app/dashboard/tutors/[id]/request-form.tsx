"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CalendarCheck2, CalendarPlus, Clock, MessageCircle, Repeat, Send, Zap } from "lucide-react";
import { requestLesson } from "@/app/actions/lessons";
import { DateTimeFields, type DateTimeValue } from "@/components/forms/date-time-fields";
import { Button, LinkButton } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { easternDateOffset, easternToUtc, formatDate, formatTime, formatWhen, validateSlot } from "@/lib/time";
import { messageViolation } from "@/lib/moderation";
import { RELATED_GROUPS } from "@/lib/matching";
import { MAX_UPCOMING, NEW_STUDENT_NOTICE_HOURS, defaultMinutes, friendlyDay, openSlots, weeklyStarts, type BusyInterval, type OpenSlot } from "@/lib/slots";
import type { ActionState } from "@/lib/errors";
import type { ConsentState } from "@/lib/data";
import { cn } from "@/lib/cn";
import { TimePicker } from "@/components/forms/time-picker";

interface Props {
  tutor: {
    id: string;
    name: string;
    sessionMinutes: number[];
    subjects: { id: string; slug: string; name: string }[];
    availability: string[];
    /** When the tutor already has a lesson or an open request (no details). */
    busy: BusyInterval[];
  };
  students: {
    id: string;
    name: string;
    consent: ConsentState;
    preferredMinutes: number;
    availability: string[];
    /** This student's own booked or requested lessons. */
    busy: BusyInterval[];
    /** How many more lessons this student can book ahead with this tutor (MAX_UPCOMING at most). */
    room: number;
    subjects: { id: string; slug: string; name: string }[];
  }[];
  initialStudentId?: string;
  initialSubjectId?: string;
  /** A time picked on a tutor card ("?slot="), preselected if it's still open. */
  initialStart?: string;
  canRequest: boolean;
  /** Students already working with this tutor: whether their open times book instantly, and the notice the tutor asks for. */
  booking?: Record<string, { instant: boolean; minNoticeHours: number }>;
  /** The signed-in account is the student (changes "Leo’s" to "your"). */
  isStudent: boolean;
  threadHref?: string;
}

const related = (a: string, b: string) => a === b || RELATED_GROUPS.some((g) => g.includes(a) && g.includes(b));
const WEEK_CHOICES = Array.from({ length: MAX_UPCOMING - 1 }, (_, i) => i + 2);
const DAYS_SHOWN = 14;
const weekdayLong = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(d);
const short = (d: Date | string) => formatDate(d).replace(/, \d{4}$/, "");

function Step({ n, title, aside, children }: { n: number; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white" aria-hidden>
          {n}
        </span>
        <h3 className="flex-1 text-[14px] font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function RequestLessonForm({ tutor, students, initialStudentId, initialSubjectId, initialStart, canRequest, booking = {}, isStudent, threadHref }: Props) {
  const [studentId, setStudentId] = useState(initialStudentId ?? students[0]?.id ?? "");
  const student = students.find((s) => s.id === studentId);
  const teachable = useMemo(() => (student?.subjects ?? []).filter((s) => tutor.subjects.some((t) => related(t.slug, s.slug))), [student, tutor.subjects]);
  const [subjectId, setSubjectId] = useState(initialSubjectId && teachable.some((t) => t.id === initialSubjectId) ? initialSubjectId : (teachable[0]?.id ?? ""));
  const [minutes, setMinutes] = useState(() => defaultMinutes(tutor.sessionMinutes, student?.preferredMinutes));
  // Working together already: the tutor's own notice, and maybe instant booking. New: 12 hours, always a request.
  const together = studentId ? booking[studentId] : undefined;
  const leadHours = together ? together.minNoticeHours : NEW_STUDENT_NOTICE_HOURS;

  const slots = useMemo(
    () =>
      openSlots({
        tutorAvailability: tutor.availability,
        studentAvailability: student?.availability ?? [],
        busy: [...tutor.busy, ...(student?.busy ?? [])],
        minutes,
        days: DAYS_SHOWN,
        leadHours,
      }),
    [tutor.availability, tutor.busy, student, minutes, leadHours],
  );
  // A time chosen on the tutor card wins; otherwise nothing is chosen until the family taps one.
  const [picked, setPicked] = useState<OpenSlot | null>(() => (initialStart ? (slots.find((s) => s.start === initialStart) ?? null) : null));
  // Checked once, against the times offered on arrival: changing the length later isn’t "taken".
  const [staleStart] = useState(() => Boolean(initialStart) && !slots.some((s) => s.start === initialStart));
  const [manual, setManual] = useState(false);
  const [dt, setDt] = useState<DateTimeValue>({ date: easternDateOffset(2), time: "", minutes });
  const [repeat, setRepeat] = useState(false);
  const [weeks, setWeeks] = useState(MAX_UPCOMING);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionState<{ id: string; booked: boolean; respondBy: string | null }>>(null);
  const [pending, start] = useTransition();


  const chosen = manual ? (dt.date && dt.time ? { date: dt.date, time: dt.time } : null) : picked ? { date: picked.date, time: picked.time } : null;
  const effectiveMinutes = manual ? dt.minutes : minutes;
  const startDate = chosen ? easternToUtc(chosen.date, chosen.time) : null;
  const slotIssue = !chosen
    ? "Choose a time."
    : (validateSlot(startDate, effectiveMinutes) ??
      (startDate && startDate.getTime() < Date.now() + leadHours * 3600000
        ? `Please pick a time at least ${leadHours} hours from now${together ? "." : ", so the tutor has time to answer."}`
        : null));
  // Booked straight away: an open time (inside the tutor's free times) with a tutor who allows it.
  const instant = Boolean(together?.instant) && !manual && Boolean(picked);
  // Up to MAX_UPCOMING lessons ahead with one tutor: a weekly run only offers what still fits.
  const room = Math.max(0, Math.min(MAX_UPCOMING, student?.room ?? MAX_UPCOMING));
  const weekChoices = WEEK_CHOICES.filter((w) => w <= room);
  const nWeeks = repeat && weekChoices.length ? Math.min(weeks, room) : 1;
  const series = chosen && !slotIssue ? weeklyStarts(chosen.date, chosen.time, nWeeks) : [];
  const tooFar = series.length > 1 && series[series.length - 1].getTime() > Date.now() + 90 * 86400000;
  const noteIssue = note ? messageViolation(note) : null;
  const tutorFirst = tutor.name.split(" ")[0];
  const yours = isStudent ? "your" : `${student?.name ?? "your student"}’s`;
  const lockReason =
    !canRequest
      ? `${tutorFirst} isn’t taking new students right now.`
      : !subjectId
        ? `${tutorFirst} doesn’t teach ${isStudent ? "your" : `${student?.name}’s`} instrument.`
        : student?.consent === "none"
          ? isStudent
            ? "You can book once your parent approves your account."
            : `Sign the consent form for ${student?.name} to book.`
          : room === 0
            ? `${isStudent ? "You have" : `${student?.name} has`} ${MAX_UPCOMING} lessons booked ahead with ${tutorFirst}, the most at once. Book the next one after ${isStudent ? "your" : "their"} next lesson.`
            : null;
  const subjectName = teachable.find((t) => t.id === subjectId)?.name ?? "";

  if (result?.ok && result.data?.booked) {
    return (
      <div className="animate-rise rounded-2xl border border-pine-200 bg-pine-50 p-6" role="status">
        <span className="flex size-11 items-center justify-center rounded-full bg-card text-pine-700 ring-1 ring-pine-200">
          <CalendarCheck2 className="size-5" aria-hidden />
        </span>
        <h2 className="display mt-4 text-3xl">
          You’re <em>booked</em>!
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          {series.length > 1 ? `${series.length} weekly lessons, ${weekdayLong(series[0])}s at ${formatTime(series[0])} ET. ` : startDate ? `${friendlyDay(chosen!.date)} at ${formatTime(startDate)} ET. ` : ""}
          We emailed {tutorFirst}. The Join button shows up on your Lessons page 15 minutes before it starts.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <LinkButton href={`/dashboard/lessons?tab=upcoming&focus=${result.data?.id}`} size="sm">
            See it in Lessons
          </LinkButton>
          <Button size="sm" variant="ghost" onClick={() => { setResult(null); setPicked(null); }}>
            Book another
          </Button>
        </div>
      </div>
    );
  }

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-pine-200 bg-pine-50 p-6" role="status">
        <span className="flex size-11 items-center justify-center rounded-full bg-card text-pine-700 ring-1 ring-pine-200">
          <CalendarCheck2 className="size-5" aria-hidden />
        </span>
        <h2 className="display mt-4 text-3xl">Request sent!</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          {series.length > 1 ? `${series.length} weekly lessons, ${weekdayLong(series[0])}s at ${formatTime(series[0])} ET. ` : startDate ? `${friendlyDay(chosen!.date)} at ${formatTime(startDate)} ET. ` : ""}
          We emailed {tutorFirst}.{" "}
          {result.data?.respondBy ? `They have until ${formatWhen(result.data.respondBy)} to answer.` : ""} We’ll email you either way, so you’re never left wondering.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <LinkButton href={`/dashboard/lessons?focus=${result.data?.id}`} size="sm">
            See it in Lessons
          </LinkButton>
          {threadHref && (
            <LinkButton href={threadHref} size="sm" variant="secondary">
              <MessageCircle className="size-4" aria-hidden /> Message {tutorFirst}
            </LinkButton>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setResult(null);
              setPicked(null);
            }}
          >
            Request another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-lift">
      <div className="border-b border-line bg-paper/50 px-5 py-4">
        <h2 className="text-[17px] font-semibold">Book a lesson with {tutorFirst}</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          {together?.instant
            ? `Pick one of ${tutorFirst}’s open times and it’s booked right away. Times are Eastern.`
            : `Pick a time and ${tutorFirst} says yes or suggests another. Times are Eastern.`}
        </p>
      </div>
      <form
        className="space-y-6 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!chosen || lockReason) return;
          start(async () =>
            setResult(await requestLesson({ studentId, tutorId: tutor.id, subjectId, date: chosen.date, time: chosen.time, minutes: effectiveMinutes, note, weeks: nWeeks })),
          );
        }}
      >
        {lockReason && <Notice tone={canRequest && subjectId ? "info" : "warning"}>{lockReason}{student?.consent === "none" && !isStudent && <> <Link href="/dashboard/students" className="font-medium underline underline-offset-2">Sign it here</Link>.</>}</Notice>}

        <Step n={1} title="Lesson">
          <div className="space-y-3">
            {students.length > 1 && (
              <Select
                aria-label="Which student"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  setPicked(null);
                  const s = students.find((x) => x.id === e.target.value);
                  setSubjectId(s?.subjects.find((x) => tutor.subjects.some((ts) => related(ts.slug, x.slug)))?.id ?? "");
                }}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    For {s.name}
                  </option>
                ))}
              </Select>
            )}
            {teachable.length > 1 && (
              <Select aria-label="Instrument" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {teachable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
            {teachable.length === 1 && <p className="text-[14px] font-medium">{teachable[0].name}</p>}
            {!manual && tutor.sessionMinutes.length > 1 && (
              <div className="flex w-full rounded-full border border-line bg-paper-2/70 p-0.5" role="radiogroup" aria-label="Lesson length">
                {tutor.sessionMinutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={minutes === m}
                    onClick={() => {
                      setMinutes(m);
                      setPicked(null);
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
            {!manual && tutor.sessionMinutes.length === 1 && <p className="text-[13px] text-muted">{minutes}-minute lessons</p>}
          </div>
        </Step>

        <Step
          n={2}
          title="Pick a time"
          aside={
            <button type="button" onClick={() => setManual(!manual)} className="text-[12.5px] font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
              {manual ? "Back to open times" : "Suggest your own"}
            </button>
          }
        >
          {manual ? (
            <div className="rounded-xl bg-paper-2/50 p-3">
              <p className="mb-3 text-[13px] text-muted">{tutorFirst} will accept it or suggest a time that works better.</p>
              <DateTimeFields value={dt} onChange={setDt} min={easternDateOffset(0)} max={easternDateOffset(89)} durations={tutor.sessionMinutes} />
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-xl bg-paper-2/60 px-4 py-4 text-[13px] leading-relaxed text-muted">
              No open times in the next two weeks.{" "}
              <button type="button" onClick={() => setManual(true)} className="font-medium text-pine-700 underline underline-offset-2">
                Suggest your own time
              </button>{" "}
              and {tutorFirst} can accept it or offer another.
            </div>
          ) : (
            <>
              {staleStart && !picked && minutes === defaultMinutes(tutor.sessionMinutes, student?.preferredMinutes) && (
                <Notice tone="warning" className="mb-3">
                  That time was just taken. Here are the times still open.
                </Notice>
              )}
              <TimePicker slots={slots} value={picked} onChange={setPicked} fitsLabel={yours} days={DAYS_SHOWN} />
            </>
          )}
        </Step>

        <Step
          n={3}
          title="How often"
          aside={<span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">{room < MAX_UPCOMING ? `${room} of ${MAX_UPCOMING} left` : `Up to ${MAX_UPCOMING} ahead`}</span>}
        >
          <div className="inline-flex w-full rounded-full border border-line bg-paper-2/70 p-0.5" role="radiogroup" aria-label="How often">
            {[false, true].map((r) => (
              <button
                key={String(r)}
                type="button"
                role="radio"
                aria-checked={repeat === r}
                disabled={r && weekChoices.length === 0}
                onClick={() => setRepeat(r)}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                  repeat === r ? "bg-card text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
                )}
              >
                {r && <Repeat className="size-3.5" aria-hidden />}
                {r ? "Every week" : "Just once"}
              </button>
            ))}
          </div>
          {repeat && weekChoices.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Number of weeks">
              <span className="mr-1 text-[13px] text-muted">For</span>
              {weekChoices.map((w) => (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={nWeeks === w}
                  onClick={() => setWeeks(w)}
                  className={cn(
                    "h-8 min-w-10 rounded-full border px-2.5 text-[13px] font-medium tabular-nums transition",
                    nWeeks === w ? "border-pine-700 bg-pine-50 text-pine-800" : "border-line-2 bg-card text-ink-2 hover:border-ink/30",
                  )}
                >
                  {w}
                </button>
              ))}
              <span className="ml-1 text-[13px] text-muted">weeks</span>
            </div>
          )}
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            {room === 0
              ? "Booking opens again as soon as a lesson happens."
              : `You can have up to ${MAX_UPCOMING} lessons booked ahead with one tutor${room < MAX_UPCOMING ? `, so ${room} more for now` : ""}. After each lesson, book the next.`}
          </p>
        </Step>

        {showNote ? (
          <div>
            <label htmlFor="rs-note" className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium">
              Note for {tutorFirst} <span className="font-normal text-faint">Optional</span>
            </label>
            <Textarea
              id="rs-note"
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
              aria-invalid={Boolean(noteIssue)}
              placeholder="e.g. Working on the concert music, measures 20–40"
            />
            {noteIssue && <p className="mt-1.5 text-[13px] text-clay-700">Notes can’t include {noteIssue}.</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setShowNote(true)} className="text-[13px] font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
            + Add a note for {tutorFirst}
          </button>
        )}

        <div className={cn("rounded-xl border p-4 transition", chosen && !slotIssue ? "border-pine-200 bg-pine-50/60" : "border-dashed border-line-2 bg-paper/50")} aria-live="polite">
          {chosen && !slotIssue && startDate ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-pine-800">{instant ? "You’re booking" : "You’re requesting"}</p>
              <p className="mt-1 text-[16px] font-semibold">
                {series.length > 1 ? `${weekdayLong(series[0])}s` : `${friendlyDay(chosen.date)}${["Today", "Tomorrow"].includes(friendlyDay(chosen.date)) ? `, ${short(startDate)}` : ""}`}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-ink-2">
                <Clock className="size-3.5" aria-hidden />
                {formatTime(startDate)} – {formatTime(new Date(startDate.getTime() + effectiveMinutes * 60000))} ET · {effectiveMinutes} min{subjectName && ` · ${subjectName}`}
              </p>
              {series.length > 1 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-relaxed text-muted">
                  <CalendarPlus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {series.length} lessons: {series.map((d) => short(d)).join(" · ")}
                </p>
              )}
              {tooFar && <p className="mt-2 text-[13px] text-clay-700">Weekly lessons need to fit within the next 90 days — choose fewer weeks.</p>}
            </>
          ) : (
            <p className="text-[13px] text-muted">{chosen && slotIssue && slotIssue !== "Choose a time." ? slotIssue : "Pick a time above to see your request here."}</p>
          )}
        </div>

        {result && !result.ok && <Notice tone="danger">{result.error.message}</Notice>}

        <Button type="submit" size="lg" className="w-full" pending={pending} disabled={Boolean(lockReason) || Boolean(slotIssue) || Boolean(noteIssue) || tooFar}>
          {!pending && (instant ? <Zap className="size-4" aria-hidden /> : <Send className="size-4" aria-hidden />)}{" "}
          {instant ? (nWeeks > 1 ? `Book ${nWeeks} weekly lessons` : "Book it") : nWeeks > 1 ? `Request ${nWeeks} weekly lessons` : `Send request to ${tutorFirst}`}
        </Button>
        <p className="text-center text-[12.5px] text-muted">
          {instant
            ? `Booked as soon as you tap. ${tutorFirst} gets an email.`
            : `Nothing is booked until ${tutorFirst} says yes. We’ll email you either way.`}
        </p>
      </form>
    </div>
  );
}
