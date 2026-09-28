"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CalendarCheck2, MessageCircle, Send } from "lucide-react";
import { requestLesson } from "@/app/actions/lessons";
import { openThread } from "@/app/actions/messages";
import { DateTimeFields, type DateTimeValue } from "@/components/forms/date-time-fields";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { easternDateOffset, easternToUtc, validateSlot } from "@/lib/time";
import { messageViolation } from "@/lib/moderation";
import { RELATED_GROUPS } from "@/lib/matching";
import type { ActionState } from "@/lib/errors";
import type { ConsentState } from "@/lib/data";

interface Props {
  tutor: { id: string; name: string; sessionMinutes: number[]; subjects: { id: string; slug: string; name: string }[] };
  students: { id: string; name: string; consent: ConsentState; preferredMinutes: number; subjects: { id: string; slug: string; name: string }[] }[];
  initialStudentId?: string;
  initialSubjectId?: string;
  canRequest: boolean;
}

const related = (a: string, b: string) => a === b || RELATED_GROUPS.some((g) => g.includes(a) && g.includes(b));

export function RequestLessonForm({ tutor, students, initialStudentId, initialSubjectId, canRequest }: Props) {
  const [studentId, setStudentId] = useState(initialStudentId ?? students[0]?.id ?? "");
  const student = students.find((s) => s.id === studentId);
  const teachable = useMemo(
    () => (student?.subjects ?? []).filter((s) => tutor.subjects.some((t) => related(t.slug, s.slug))),
    [student, tutor.subjects],
  );
  const [subjectId, setSubjectId] = useState(initialSubjectId && teachable.some((t) => t.id === initialSubjectId) ? initialSubjectId : teachable[0]?.id ?? "");
  const [dt, setDt] = useState<DateTimeValue>({
    date: easternDateOffset(2),
    time: "",
    minutes: tutor.sessionMinutes.includes(student?.preferredMinutes ?? 45) ? (student?.preferredMinutes ?? 45) : tutor.sessionMinutes[0],
  });
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionState<{ id: string }>>(null);
  const [pending, start] = useTransition();
  const [hiPending, startHi] = useTransition();

  const noteIssue = note ? messageViolation(note) : null;
  const slotIssue = dt.date && dt.time ? validateSlot(easternToUtc(dt.date, dt.time), dt.minutes) : "Choose a date and time.";
  const blocked = student?.consent !== "active" || !canRequest || !subjectId;

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-pine-200 bg-pine-50 p-6">
        <CalendarCheck2 className="size-7 text-pine-700" />
        <h2 className="display mt-3 text-3xl">Request sent</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          We emailed {tutor.name.split(" ")[0]}. You’ll get an email as soon as they accept or suggest another time.
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
        <h2 className="text-[16px] font-semibold">Request a lesson</h2>
        <p className="text-[13px] text-muted">{tutor.name.split(" ")[0]} will accept, decline, or suggest another time.</p>
      </div>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setResult(await requestLesson({ studentId, tutorId: tutor.id, subjectId, ...dt, note })));
        }}
      >
        {students.length > 1 && (
          <Field label="For" htmlFor="rs-student">
            <Select
              id="rs-student"
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
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
          <p className="text-sm">
            <span className="text-muted">Instrument:</span> <strong>{teachable[0].name}</strong>
          </p>
        ) : (
          <Notice tone="warning">{tutor.name.split(" ")[0]} doesn’t teach any of {student?.name}’s instruments.</Notice>
        )}

        <DateTimeFields value={dt} onChange={setDt} min={easternDateOffset(0)} max={easternDateOffset(89)} durations={tutor.sessionMinutes} />

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
        {!canRequest && <Notice tone="info">{tutor.name.split(" ")[0]} isn’t taking new students right now.</Notice>}
        {result && !result.ok && <Notice tone="danger">{result.error.message}</Notice>}

        <Button type="submit" size="lg" className="w-full" pending={pending} disabled={blocked || Boolean(slotIssue) || Boolean(noteIssue)}>
          <Send className="size-4" /> Send request
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
