"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CalendarCheck2, CalendarPlus, ChevronLeft, ChevronRight, Clock, MessageCircle, Repeat, Send, Star } from "lucide-react";
import { requestLesson } from "@/app/actions/lessons";
import { DateTimeFields, type DateTimeValue } from "@/components/forms/date-time-fields";
import { Button, LinkButton } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { easternDateOffset, easternToUtc, formatDate, formatTime, validateSlot } from "@/lib/time";
import { messageViolation } from "@/lib/moderation";
import { RELATED_GROUPS } from "@/lib/matching";
import { DAY_PARTS, bestSlot, calendarLabel, dayPart, defaultMinutes, friendlyDay, openSlots, weeklyStarts, type BusyInterval, type OpenSlot } from "@/lib/slots";
import type { ActionState } from "@/lib/errors";
import type { ConsentState } from "@/lib/data";
import { cn } from "@/lib/cn";

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
    subjects: { id: string; slug: string; name: string }[];
  }[];
  initialStudentId?: string;
  initialSubjectId?: string;
  /** A time picked on a tutor card ("?slot="), preselected if it's still open. */
  initialStart?: string;
  canRequest: boolean;
  /** The signed-in account is the student (changes "Leo’s" to "your"). */
  isStudent: boolean;
  threadHref?: string;
}

const related = (a: string, b: string) => a === b || RELATED_GROUPS.some((g) => g.includes(a) && g.includes(b));
const WEEK_CHOICES = [2, 4, 6, 8, 10, 12];
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

export function RequestLessonForm({ tutor, students, initialStudentId, initialSubjectId, initialStart, canRequest, isStudent, threadHref }: Props) {
  const [studentId, setStudentId] = useState(initialStudentId ?? students[0]?.id ?? "");
  const student = students.find((s) => s.id === studentId);
  const teachable = useMemo(() => (student?.subjects ?? []).filter((s) => tutor.subjects.some((t) => related(t.slug, s.slug))), [student, tutor.subjects]);
  const [subjectId, setSubjectId] = useState(initialSubjectId && teachable.some((t) => t.id === initialSubjectId) ? initialSubjectId : (teachable[0]?.id ?? ""));
  const [minutes, setMinutes] = useState(() => defaultMinutes(tutor.sessionMinutes, student?.preferredMinutes));

  const slots = useMemo(
    () =>
      openSlots({
        tutorAvailability: tutor.availability,
        studentAvailability: student?.availability ?? [],
        busy: [...tutor.busy, ...(student?.busy ?? [])],
        minutes,
        days: DAYS_SHOWN,
      }),
    [tutor.availability, tutor.busy, student, minutes],
  );
  // A time chosen on the tutor card wins; otherwise nothing is chosen until the family taps one.
  const [picked, setPicked] = useState<OpenSlot | null>(() => (initialStart ? (slots.find((s) => s.start === initialStart) ?? null) : null));
  // Checked once, against the times offered on arrival: changing the length later isn’t "taken".
  const [staleStart] = useState(() => Boolean(initialStart) && !slots.some((s) => s.start === initialStart));
  const [manual, setManual] = useState(false);
  const [dt, setDt] = useState<DateTimeValue>({ date: easternDateOffset(2), time: "", minutes });
  const [repeat, setRepeat] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionState<{ id: string }>>(null);
  const [pending, start] = useTransition();

  const dates = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => easternDateOffset(i)), []);
  const byDay = useMemo(() => {
    const m = new Map<string, OpenSlot[]>();
    for (const s of slots) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [slots]);
  const suggested = bestSlot(slots);
  const [day, setDay] = useState<string | null>(picked?.date ?? null);
  const activeDay = day && byDay.has(day) ? day : (picked?.date ?? suggested?.date ?? null);
  const [page, setPage] = useState(() => Math.max(0, Math.floor(dates.indexOf(activeDay ?? dates[0]) / 7)));
  const daySlots = (activeDay && byDay.get(activeDay)) || [];

  const chosen = manual ? (dt.date && dt.time ? { date: dt.date, time: dt.time } : null) : picked ? { date: picked.date, time: picked.time } : null;
  const effectiveMinutes = manual ? dt.minutes : minutes;
  const startDate = chosen ? easternToUtc(chosen.date, chosen.time) : null;
  const slotIssue = !chosen ? "Choose a time." : validateSlot(startDate, effectiveMinutes);
  const nWeeks = repeat ? weeks : 1;
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
          : student?.consent === "pending"
            ? isStudent
              ? "You can book right after the program’s quick call with your parent."
              : `You can book right after our quick call to confirm consent for ${student?.name}.`
            : null;
  const subjectName = teachable.find((t) => t.id === subjectId)?.name ?? "";

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-pine-200 bg-pine-50 p-6" role="status">
        <span className="flex size-11 items-center justify-center rounded-full bg-card text-pine-700 ring-1 ring-pine-200">
          <CalendarCheck2 className="size-5" aria-hidden />
        </span>
        <h2 className="display mt-4 text-3xl">Request sent!</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          {series.length > 1 ? `${series.length} weekly lessons, ${weekdayLong(series[0])}s at ${formatTime(series[0])} ET. ` : startDate ? `${friendlyDay(chosen!.date)} at ${formatTime(startDate)} ET. ` : ""}
          We emailed {tutorFirst}. You’ll get an email as soon as they accept or suggest another time.
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
        <p className="mt-0.5 text-[13px] text-muted">Pick a time — {tutorFirst} accepts it or suggests another. Times are Eastern.</p>
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
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-medium text-ink-2">
                  {calendarLabel(dates[page * 7], { month: "short", day: "numeric" })} – {calendarLabel(dates[page * 7 + 6], { month: "short", day: "numeric" })}
                </p>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setPage(0)} disabled={page === 0} aria-label="This week" className="rounded-full p-1.5 text-ink-2 hover:bg-paper-2 disabled:opacity-30">
                    <ChevronLeft className="size-4" />
                  </button>
                  <button type="button" onClick={() => setPage(1)} disabled={page === 1} aria-label="Next week" className="rounded-full p-1.5 text-ink-2 hover:bg-paper-2 disabled:opacity-30">
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1" role="group" aria-label="Day">
                {dates.slice(page * 7, page * 7 + 7).map((d) => {
                  const list = byDay.get(d) ?? [];
                  const on = d === activeDay;
                  const fits = list.some((s) => s.both);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={!list.length}
                      aria-pressed={on}
                      aria-label={`${calendarLabel(d, { weekday: "long", month: "long", day: "numeric" })}: ${list.length ? `${list.length} open time${list.length === 1 ? "" : "s"}` : "no open times"}`}
                      onClick={() => setDay(d)}
                      className={cn(
                        "flex flex-col items-center rounded-xl border py-1.5 transition",
                        on ? "border-ink bg-ink text-cream" : list.length ? "border-line bg-card hover:border-pine-500" : "border-transparent text-faint",
                      )}
                    >
                      <span className={cn("text-[10px] font-semibold uppercase", on ? "text-white/80" : "text-muted")}>{calendarLabel(d, { weekday: "short" })}</span>
                      <span className="text-[15px] font-semibold leading-tight">{calendarLabel(d, { day: "numeric" })}</span>
                      <span className={cn("mt-0.5 size-1.5 rounded-full", !list.length ? "bg-transparent" : fits ? (on ? "bg-brass-300" : "bg-pine-600") : on ? "bg-white/50" : "bg-line-2")} aria-hidden />
                    </button>
                  );
                })}
              </div>

              {activeDay && (
                <div className="mt-4 space-y-3" role="radiogroup" aria-label={`Start times on ${calendarLabel(activeDay, { weekday: "long", month: "long", day: "numeric" })}`}>
                  <p className="text-[13px] font-semibold">{calendarLabel(activeDay, { weekday: "long", month: "long", day: "numeric" })}</p>
                  {DAY_PARTS.map((part) => {
                    const list = daySlots.filter((s) => dayPart(s.time) === part);
                    if (!list.length) return null;
                    return (
                      <div key={part}>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">{part}</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {list.map((s) => {
                            const on = picked?.start === s.start;
                            return (
                              <button
                                key={s.start}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                aria-label={`${formatTime(s.start)}${s.both ? `, fits ${yours} free times` : ""}`}
                                onClick={() => setPicked(s)}
                                className={cn(
                                  "inline-flex h-9 items-center justify-center gap-1 rounded-lg border text-[13px] font-medium tabular-nums transition",
                                  on
                                    ? "border-ink bg-ink text-cream shadow-[0_0_0_3px_rgb(42_106_87/0.15)]"
                                    : s.both
                                      ? "border-pine-200 bg-pine-50 text-pine-800 hover:border-pine-600"
                                      : "border-line bg-card text-ink-2 hover:border-ink/30",
                                )}
                              >
                                {s.both && <Star className={cn("size-3", on ? "fill-brass-300 text-brass-300" : "fill-current")} aria-hidden />}
                                {formatTime(s.start)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <Star className="size-3 fill-pine-600 text-pine-600" aria-hidden /> Fits {yours} usual free times
              </p>
            </>
          )}
        </Step>

        <Step n={3} title="How often">
          <div className="inline-flex w-full rounded-full border border-line bg-paper-2/70 p-0.5" role="radiogroup" aria-label="How often">
            {[false, true].map((r) => (
              <button
                key={String(r)}
                type="button"
                role="radio"
                aria-checked={repeat === r}
                onClick={() => setRepeat(r)}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition",
                  repeat === r ? "bg-card text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
                )}
              >
                {r && <Repeat className="size-3.5" aria-hidden />}
                {r ? "Every week" : "Just once"}
              </button>
            ))}
          </div>
          {repeat && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Number of weeks">
              <span className="mr-1 text-[13px] text-muted">For</span>
              {WEEK_CHOICES.map((w) => (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={weeks === w}
                  onClick={() => setWeeks(w)}
                  className={cn(
                    "h-8 min-w-10 rounded-full border px-2.5 text-[13px] font-medium tabular-nums transition",
                    weeks === w ? "border-pine-700 bg-pine-50 text-pine-800" : "border-line-2 bg-card text-ink-2 hover:border-ink/30",
                  )}
                >
                  {w}
                </button>
              ))}
              <span className="ml-1 text-[13px] text-muted">weeks</span>
            </div>
          )}
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
              <p className="text-[11px] font-semibold uppercase tracking-wider text-pine-800">You’re requesting</p>
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
          {!pending && <Send className="size-4" aria-hidden />} {nWeeks > 1 ? `Request ${nWeeks} weekly lessons` : `Send request to ${tutorFirst}`}
        </Button>
      </form>
    </div>
  );
}
