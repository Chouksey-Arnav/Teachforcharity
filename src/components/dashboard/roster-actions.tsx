"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { CalendarPlus, Settings2, X, Zap } from "lucide-react";
import { getProposeSlots, proposeLesson, setTeachership, type LessonSlots } from "@/app/actions/lessons";
import { TimePicker } from "@/components/forms/time-picker";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatWhen } from "@/lib/time";
import { MAX_UPCOMING, type OpenSlot } from "@/lib/slots";
import { cn } from "@/lib/cn";

type Panel = null | "propose" | "settings" | "end";

/** On a roster card: propose the next lesson, and this student's booking settings. */
export function RosterActions({
  teachershipId,
  studentId,
  studentName,
  subjectId,
  instantBook,
  tutorInstantBook,
  active,
}: {
  teachershipId: string;
  studentId: string;
  studentName: string;
  subjectId: string | null;
  instantBook: boolean;
  /** The tutor's switch for everyone (Profile → Booking). */
  tutorInstantBook: boolean;
  active: boolean;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: { message: string } } | null>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r?.ok) {
        setMessage(r.message ?? "Done.");
        setPanel(null);
      } else setError(r?.error?.message ?? "Something went wrong.");
    });

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {active && subjectId && (
          <Button size="sm" variant={panel === "propose" ? "primary" : "secondary"} onClick={() => setPanel(panel === "propose" ? null : "propose")} aria-expanded={panel === "propose"}>
            <CalendarPlus className="size-4" aria-hidden /> Propose a time
          </Button>
        )}
        {active && (
          <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-expanded={panel === "settings"}>
            <Settings2 className="size-4" aria-hidden /> Booking
          </Button>
        )}
      </div>
      {message && <Notice tone="success" className="mt-3">{message}</Notice>}

      {panel === "propose" && subjectId && (
        <ProposePanel studentId={studentId} studentName={studentName} subjectId={subjectId} onClose={() => setPanel(null)} onDone={(m) => { setMessage(m); setPanel(null); }} />
      )}

      {panel === "settings" && (
        <div className="animate-fade mt-3 space-y-3 rounded-2xl border border-line bg-paper/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold">
                <Zap className="mr-1 inline size-4 text-pine-700" aria-hidden />
                Instant booking for {studentName}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                {!tutorInstantBook
                  ? "Off for everyone in your profile, so every lesson is a request you answer."
                  : instantBook
                    ? `${studentName}’s family can book your open times straight away. You get an email each time.`
                    : `${studentName}’s family sends you requests to answer.`}
              </p>
            </div>
            <Button
              size="sm"
              variant={instantBook ? "secondary" : "primary"}
              pending={pending}
              disabled={!tutorInstantBook}
              onClick={() => run(() => setTeachership({ id: teachershipId, action: instantBook ? "instant_off" : "instant_on" }))}
            >
              {instantBook ? "Turn off" : "Turn on"}
            </Button>
          </div>
          <div className="border-t border-line pt-3">
            <button type="button" onClick={() => setPanel("end")} className="text-[13px] font-semibold text-clay-700 underline decoration-clay-700/30 underline-offset-4 hover:decoration-clay-700">
              Stop lessons with {studentName}…
            </button>
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      )}

      {panel === "end" && <EndPanel name={studentName} onClose={() => setPanel(null)} onConfirm={(reason) => run(() => setTeachership({ id: teachershipId, action: "end", reason }))} pending={pending} error={error} />}
    </div>
  );
}

export function EndPanel({ name, onClose, onConfirm, pending, error }: { name: string; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean; error: string | null }) {
  const [reason, setReason] = useState("");
  return (
    <div className="animate-fade mt-3 rounded-2xl border border-clay-500/30 bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold">Stop lessons with {name}?</p>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-paper-2" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">Every upcoming lesson and request between you is cancelled, and we let them know. Your past lessons and hours stay.</p>
      <Textarea className="mt-3 min-h-14" placeholder="Optional: a kind note about why (no contact info)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} />
      {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Keep lessons
        </Button>
        <Button size="sm" variant="danger" pending={pending} onClick={() => onConfirm(reason)}>
          Stop lessons
        </Button>
      </div>
    </div>
  );
}

const WEEKS = Array.from({ length: MAX_UPCOMING }, (_, i) => i + 1);

export function ProposePanel({ studentId, studentName, subjectId, onClose, onDone }: { studentId: string; studentName: string; subjectId: string; onClose: () => void; onDone: (m: string) => void }) {
  const [data, setData] = useState<LessonSlots | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [picked, setPicked] = useState<OpenSlot | null>(null);
  const [weeks, setWeeks] = useState(1);
  const [note, setNote] = useState("");
  const [attest, setAttest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    getProposeSlots({ studentId }).then((r) => {
      if (!live) return;
      if (r?.ok && r.data) {
        setData(r.data);
        setMinutes(r.data.minutes.includes(45) ? 45 : r.data.minutes[0]);
      } else setLoadError(r && !r.ok ? r.error.message : "Couldn’t load your open times.");
    });
    return () => {
      live = false;
    };
  }, [studentId]);

  const slots = data && minutes ? (data.byMinutes[minutes] ?? []) : [];
  return (
    <div className="animate-fade mt-3 rounded-2xl border border-line bg-paper/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[14px] font-semibold">Propose a lesson to {studentName}</p>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-paper-2" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {loadError ? (
        <Notice tone="warning">{loadError}</Notice>
      ) : !data ? (
        <p className="py-6 text-center text-[13px] text-muted" role="status">
          Finding your open times…
        </p>
      ) : (
        <>
          {data.minutes.length > 1 && (
            <div className="mb-3 flex w-full rounded-full border border-line bg-paper-2/70 p-0.5" role="radiogroup" aria-label="Lesson length">
              {data.minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={minutes === m}
                  onClick={() => {
                    setMinutes(m);
                    setPicked(null);
                  }}
                  className={cn("h-8 flex-1 rounded-full text-[13px] font-medium tabular-nums transition", minutes === m ? "bg-card text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink")}
                >
                  {m} min
                </button>
              ))}
            </div>
          )}
          {slots.length ? (
            <TimePicker slots={slots} value={picked} onChange={setPicked} fitsLabel={`${studentName}’s`} days={21} />
          ) : (
            <p className="rounded-xl bg-paper-2/60 px-4 py-4 text-[13px] text-muted">
              No open times in the next three weeks. Add more free times in your <Link href="/dashboard/profile" className="underline underline-offset-2">profile</Link>.
            </p>
          )}
          {(data.room ?? MAX_UPCOMING) === 0 ? (
            <Notice tone="info" className="mt-3">
              {studentName} already has {MAX_UPCOMING} lessons booked or asked for with you, the most at once. Propose the next one after a lesson happens.
            </Notice>
          ) : (
            <>
              <Select aria-label="How many weeks" className="mt-3" value={String(Math.min(weeks, data.room ?? MAX_UPCOMING))} onChange={(e) => setWeeks(Number(e.target.value))}>
                {WEEKS.filter((w) => w <= (data.room ?? MAX_UPCOMING)).map((w) => (
                  <option key={w} value={w}>
                    {w === 1 ? "Just this lesson" : `Every week, ${w} weeks`}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-[12px] text-muted">
                Up to {MAX_UPCOMING} lessons ahead with each student{(data.room ?? MAX_UPCOMING) < MAX_UPCOMING ? ` (${data.room} more for now)` : ""}.
              </p>
            </>
          )}
          <Textarea className="mt-3 min-h-14" placeholder="Optional note (no contact info)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-paper-2/60 p-3 text-[12.5px] leading-snug text-ink-2">
            <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 size-4 accent-pine-700" />
            <span>I’ll follow the lesson rules: online only, never recorded, a parent reachable, and all contact on this site.</span>
          </label>
          {picked && (
            <p className="mt-3 text-[13px] text-ink-2" aria-live="polite">
              {studentName}’s family is asked about <strong>{formatWhen(picked.start)}</strong>
              {Math.min(weeks, data.room ?? MAX_UPCOMING) > 1 ? ` and the ${Math.min(weeks, data.room ?? MAX_UPCOMING) - 1} weeks after` : ""}. Nothing is booked until they say yes.
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
              disabled={!picked || !attest || !minutes || (data.room ?? MAX_UPCOMING) === 0}
              onClick={() =>
                picked &&
                minutes &&
                start(async () => {
                  setError(null);
                  const r = await proposeLesson({ studentId, subjectId, date: picked.date, time: picked.time, minutes, weeks: Math.min(weeks, data.room ?? MAX_UPCOMING), note, attest: true });
                  if (r?.ok) onDone(r.message ?? "Proposed!");
                  else setError(r && !r.ok ? r.error.message : "Something went wrong.");
                })
              }
            >
              Send proposal
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
