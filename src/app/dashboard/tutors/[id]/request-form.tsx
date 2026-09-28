"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CalendarCheck2, CalendarDays, MessageCircle, Repeat, Send } from "lucide-react";
import { requestLesson } from "@/app/actions/lessons";
import { openThread } from "@/app/actions/messages";
import { DateTimeFields, type DateTimeValue } from "@/components/forms/date-time-fields";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { easternDateOffset, easternToUtc, formatDate, formatTime, validateSlot } from "@/lib/time";
import { messageViolation } from "@/lib/moderation";
import { RELATED_GROUPS } from "@/lib/matching";
import { openSlots, weeklyStarts, type BusyInterval, type OpenSlot } from "@/lib/slots";
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
  canRequest: boolean;
}

const related = (a: string, b: string) => a === b || RELATED_GROUPS.some((g) => g.includes(a) && g.includes(b));
const WEEK_CHOICES = [2, 3, 4, 6, 8, 10, 12];
const weekday = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(d);
const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(`${date}T12:00:00Z`));

export function RequestLessonForm({ tutor, students, initialStudentId, initialSubjectId, canRequest }: Props) {
  const [studentId, setStudentId] = useState(initialStudentId ?? students[0]?.id ?? "");
  const student = students.find((s) => s.id === studentId);
  const teachable = useMemo(
    () => (student?.subjects ?? []).filter((s) => tutor.subjects.some((t) => related(t.slug, s.slug))),
    [student, tutor.subjects],
  );
  const [subjectId, setSubjectId] = useState(initialSubjectId && teachable.some((t) => t.id === initialSubjectId) ? initialSubjectId : teachable[0]?.id ?? "");
  const [minutes, setMinutes] = useState(tutor.sessionMinutes.includes(student?.preferredMinutes ?? 45) ? (student?.preferredMinutes ?? 45) : tutor.sessionMinutes[0]);
  const [picked, setPicked] = useState<OpenSlot | null>(null);
  const [manual, setManual] = useState(false);
  const [dt, setDt] = useState<DateTimeValue>({ date: easternDateOffset(2), time: "", minutes });
  const [repeat, setRepeat] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionState<{ id: string }>>(null);
  const [pending, start] = useTransition();
  const [hiPending, startHi] = useTransition();

  const slots = useMemo(
    () =>
      openSlots({
        tutorAvailability: tutor.availability,
        studentAvailability: student?.availability ?? [],
        busy: [...tutor.busy, ...(student?.busy ?? [])],
        minutes,
      }),
    [tutor.availability, tutor.busy, student, minutes],
  );
  const days = useMemo(() => {
    const byDay = new Map<string, OpenSlot[]>();
    for (const s of slots) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
    return [...byDay.entries()];
  }, [slots]);
  const [day, setDay] = useState<string | null>(null);
  // Default to the first day with a time that suits both.
  const activeDay = days.some(([d]) => d === day) ? day : (days.find(([, ss]) => ss.some((s) => s.both))?.[0] ?? days[0]?.[0] ?? null);
  const daySlots = days.find(([d]) => d === activeDay)?.[1] ?? [];

  // What will be requested.
  const chosen = manual ? (dt.date && dt.time ? { date: dt.date, time: dt.time } : null) : picked ? { date: picked.date, time: picked.time } : null;
  const effectiveMinutes = manual ? dt.minutes : minutes;
  const startDate = chosen ? easternToUtc(chosen.date, chosen.time) : null;
  const slotIssue = !chosen ? "Choose a time." : validateSlot(startDate, effectiveMinutes);
  const nWeeks = repeat ? weeks : 1;
  const series = chosen && !slotIssue ? weeklyStarts(chosen.date, chosen.time, nWeeks) : [];
  const tooFar = series.length > 1 && series[series.length - 1].getTime() > Date.now() + 90 * 86400000;
  const noteIssue = note ? messageViolation(note) : null;
  const blocked = student?.consent !== "active" || !canRequest || !subjectId;
  const tutorFirst = tutor.name.split(" ")[0];

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-pine-200 bg-pine-50 p-6" role="status">
        <CalendarCheck2 className="size-7 text-pine-700" />
        <h2 className="display mt-3 text-3xl">Request sent</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          We emailed {tutorFirst}. You’ll get an email as soon as they accept or suggest another time.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/dashboard/lessons?focus=${result.data?.id}`} className="inline-flex h-9 items-center rounded-full bg-pine-700 px-4 text-sm font-medium text-white hover:bg-pine-800">
            View request
          </Link>
          <button type="button" onClick={() => setResult(null)} className="inline-flex h-9 items-center rounded-full px-4 text-sm text-ink-2 hover:bg-white/60">
            Request another time
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card shadow-lift">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[16px] font-semibold">Request lessons</h2>
        <p className="text-[13px] text-muted">{tutorFirst} will accept, decline, or suggest another time.</p>
      </div>
      <form
        className="space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!chosen) return;
          start(async () =>
            setResult(await requestLesson({ studentId, tutorId: tutor.id, subjectId, date: chosen.date, time: chosen.time, minutes: effectiveMinutes, note, weeks: nWeeks })),
          );
        }}
      >
        {students.length > 1 && (
          <Field label="For" htmlFor="rs-student">
            <Select
              id="rs-student"
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setPicked(null);
                const s = students.find((x) => x.id === e.target.value);
                const t = s?.subjects.find((x) => tutor.subjects.some((ts) => related(ts.slug, x.slug)));
                setSubjectId(t?.id ?? "");
              }}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {teachable.length > 1 ? (
            <Field label="Instrument" htmlFor="rs-subject">
              <Select id="rs-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {teachable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : teachable.length === 1 ? (
            <div className="text-sm">
              <p className="text-[13px] font-medium">Instrument</p>
              <p className="mt-2.5 font-semibold">{teachable[0].name}</p>
            </div>
          ) : null}
          {!manual && (
            <Field label="Length" htmlFor="rs-min">
              <Select
                id="rs-min"
                value={minutes}
                onChange={(e) => {
                  setMinutes(Number(e.target.value));
                  setPicked(null);
                }}
              >
                {tutor.sessionMinutes.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {teachable.length === 0 && <Notice tone="warning">{tutorFirst} doesn’t teach any of {student?.name}’s instruments.</Notice>}

        {!manual ? (
          <fieldset className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <legend className="text-[13px] font-medium">Open times (Eastern)</legend>
              <button type="button" onClick={() => setManual(true)} className="text-[13px] text-pine-700 underline-offset-4 hover:underline">
                Pick another time
              </button>
            </div>
            {days.length === 0 ? (
              <p className="rounded-xl bg-paper-2/60 px-3 py-3 text-[13px] text-muted">
                No open times in the next two weeks. Pick another time and {tutorFirst} can suggest one that works.
              </p>
            ) : (
              <>
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2" role="group" aria-label="Day">
                  {days.map(([d, ss]) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={d === activeDay}
                      onClick={() => setDay(d)}
                      className={cn(
                        "shrink-0 rounded-xl border px-3 py-1.5 text-center text-[12.5px] leading-tight transition",
                        d === activeDay ? "border-pine-700 bg-pine-50 text-pine-800" : "border-line bg-card text-ink-2 hover:border-line-2",
                      )}
                    >
                      <span className="block font-semibold">{dayLabel(d, { weekday: "short" })}</span>
                      <span className="block text-muted">{dayLabel(d, { month: "short", day: "numeric" })}</span>
                      <span className={cn("mx-auto mt-1 block size-1.5 rounded-full", ss.some((s) => s.both) ? "bg-pine-600" : "bg-transparent")} aria-hidden />
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Start times on ${activeDay ? dayLabel(activeDay, { weekday: "long", month: "long", day: "numeric" }) : ""}`}>
                  {daySlots.map((s) => (
                    <button
                      key={s.start}
                      type="button"
                      role="radio"
                      aria-checked={picked?.start === s.start}
                      aria-label={`${formatTime(s.start)}${s.both ? `, ${student?.name ?? "your student"} is free` : ""}`}
                      onClick={() => setPicked(s)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                        picked?.start === s.start
                          ? "border-pine-700 bg-pine-700 text-white"
                          : s.both
                            ? "border-pine-200 bg-pine-50 text-pine-800 hover:border-pine-600"
                            : "border-line bg-card text-ink-2 hover:border-line-2",
                      )}
                    >
                      {formatTime(s.start)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  <span className="mr-1 inline-block size-2 rounded-full bg-pine-600 align-middle" aria-hidden /> Green times also fit{" "}
                  {student?.name ?? "your student"}’s free times.
                </p>
              </>
            )}
          </fieldset>
        ) : (
          <div>
            <DateTimeFields value={dt} onChange={setDt} min={easternDateOffset(0)} max={easternDateOffset(89)} durations={tutor.sessionMinutes} />
            <button type="button" onClick={() => setManual(false)} className="mt-2 text-[13px] text-pine-700 underline-offset-4 hover:underline">
              Back to open times
            </button>
          </div>
        )}

        <fieldset className="min-w-0 rounded-xl border border-line p-3">
          <legend className="px-1 text-[13px] font-medium">How often</legend>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="repeat" checked={!repeat} onChange={() => setRepeat(false)} className="accent-pine-700" /> Just once
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="repeat" checked={repeat} onChange={() => setRepeat(true)} className="accent-pine-700" />
              <Repeat className="size-4 text-muted" aria-hidden /> Every week for
            </label>
            <div className="w-32">
              <Select aria-label="Number of weeks" value={weeks} disabled={!repeat} onChange={(e) => setWeeks(Number(e.target.value))} className="h-9">
                {WEEK_CHOICES.map((w) => (
                  <option key={w} value={w}>
                    {w} weeks
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {series.length > 1 && (
            <p className="mt-3 flex gap-2 text-[13px] leading-relaxed text-ink-2">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-pine-700" aria-hidden />
              <span>
                {weekday(series[0])}s at {formatTime(series[0])}: {series.map((d) => formatDate(d).replace(/, \d{4}$/, "")).join(" · ")}
              </span>
            </p>
          )}
          {tooFar && <p className="mt-2 text-[13px] text-clay-700">Weekly lessons need to fit within the next 90 days — choose fewer weeks.</p>}
        </fieldset>

        <Field label="Note for the tutor" htmlFor="rs-note" optional error={noteIssue ? `Notes can’t include ${noteIssue}.` : undefined}>
          <Textarea id="rs-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="e.g. Working on the concert music, measures 20–40" />
        </Field>

        {student?.consent === "none" && (
          <Notice tone="warning">
            Consent for {student?.name} isn’t signed yet.{" "}
            <Link href="/dashboard/students" className="underline underline-offset-2">
              Sign it here
            </Link>
            .
          </Notice>
        )}
        {student?.consent === "pending" && (
          <Notice tone="info">We’ll call to confirm consent for {student?.name} first — you can send requests right after that call.</Notice>
        )}
        {!canRequest && <Notice tone="info">{tutorFirst} isn’t taking new students right now.</Notice>}
        {result && !result.ok && <Notice tone="danger">{result.error.message}</Notice>}

        <Button type="submit" size="lg" className="w-full" pending={pending} disabled={blocked || Boolean(slotIssue) || Boolean(noteIssue) || tooFar}>
          <Send className="size-4" /> {nWeeks > 1 ? `Request ${nWeeks} weekly lessons` : "Send request"}
        </Button>

        {student?.consent === "active" && (
          <button
            type="button"
            disabled={hiPending}
            onClick={() => startHi(async () => void (await openThread(tutor.id, studentId, "family_intro")))}
            className="flex w-full items-center justify-center gap-2 rounded-full py-2 text-sm text-muted hover:text-ink"
          >
            <MessageCircle className="size-4" /> {hiPending ? "Opening…" : "Or send a quick hello first"}
          </button>
        )}
      </form>
    </div>
  );
}
