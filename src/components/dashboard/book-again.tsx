"use client";
import { useState, useTransition } from "react";
import { CalendarCheck2, Zap } from "lucide-react";
import { requestLesson } from "@/app/actions/lessons";
import { Button, LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatTime } from "@/lib/time";
import { friendlyDay } from "@/lib/slots";

/**
 * Two taps to the next lesson: "Book" shows exactly what will happen, "Yes"
 * does it. Instant with a tutor who allows it, otherwise a request.
 */
export function BookAgain({
  tutorFirst,
  studentId,
  tutorId,
  subjectId,
  slot,
  minutes,
  instant,
  pickHref,
}: {
  tutorFirst: string;
  studentId: string;
  tutorId: string;
  subjectId: string;
  slot: { date: string; time: string; start: string };
  minutes: number;
  instant: boolean;
  pickHref: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remembers what was booked: the suggestion moves on to the next week as soon as the page refreshes.
  const [done, setDone] = useState<{ booked: boolean; id: string; when: string } | null>(null);
  const [pending, start] = useTransition();
  const when = `${friendlyDay(slot.date)} · ${formatTime(slot.start)}`;

  if (done) {
    return (
      <div className="animate-fade rounded-xl bg-pine-50 px-3.5 py-3 text-[13.5px] text-pine-800" role="status">
        <p className="flex items-center gap-1.5 font-semibold">
          <CalendarCheck2 className="size-4" aria-hidden /> {done.booked ? `Booked: ${done.when}` : `Asked ${tutorFirst} for ${done.when}`}
        </p>
        <p className="mt-0.5 text-ink-2">{done.booked ? `We emailed ${tutorFirst}.` : `We’ll email you when ${tutorFirst} answers.`}</p>
        <LinkButton href={`/dashboard/lessons?focus=${done.id}`} size="sm" variant="ghost" className="-ml-3 mt-1">
          See it in Lessons
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-paper-2/60 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Book again</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-semibold">
          {when} <span className="font-normal text-muted">· {minutes} min</span>
        </p>
        {!confirming && (
          <Button size="sm" onClick={() => setConfirming(true)} aria-label={`${instant ? "Book" : "Request"} ${when} with ${tutorFirst}`}>
            {instant && <Zap className="size-4" aria-hidden />} {instant ? "Book" : "Request"}
          </Button>
        )}
      </div>
      {confirming && (
        <div className="animate-fade mt-2">
          <p className="text-[13px] text-ink-2">
            {instant ? `It’s booked as soon as you tap Yes, and ${tutorFirst} gets an email.` : `${tutorFirst} will be asked. Nothing is booked until they say yes.`}
          </p>
          {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              pending={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await requestLesson({ studentId, tutorId, subjectId, date: slot.date, time: slot.time, minutes, weeks: 1 });
                  if (r?.ok && r.data) setDone({ booked: r.data.booked, id: r.data.id, when });
                  else setError(r && !r.ok ? r.error.message : "Something went wrong. Please try again.");
                })
              }
            >
              {instant ? "Yes, book it" : "Yes, send it"}
            </Button>
            <LinkButton href={pickHref} size="sm" variant="ghost">
              Pick another time
            </LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}
