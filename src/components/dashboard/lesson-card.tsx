"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowRightLeft, BadgeCheck, CheckCircle2, Clock, MessageCircle, Video, X, XCircle } from "lucide-react";
import type { MySession } from "@/lib/data";
import { SESSION_STATUS_LABEL } from "@/lib/constants";
import { formatDay, formatTime, easternDateOffset, easternParts } from "@/lib/time";
import { Badge, sessionTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/field";
import { DateTimeFields, type DateTimeValue } from "@/components/forms/date-time-fields";
import { cancelLesson, confirmLesson, logLesson, respondLesson } from "@/app/actions/lessons";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/cn";

type Panel = null | "counter" | "decline" | "cancel" | "log-no" | "confirm-no";

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
  const [dt, setDt] = useState<DateTimeValue>(() => {
    const p = easternParts(new Date(s.start_at));
    return { date: p.date, time: p.time, minutes: s.duration_minutes };
  });
  const [result, setResult] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  const start_ = new Date(s.start_at).getTime();
  const end = new Date(s.end_at).getTime();
  const isTutor = s.my_side === "tutor";
  const other = isTutor ? `${s.student_name} (${s.student_grade}th grade)` : s.tutor_name;
  const canJoin = s.status === "scheduled" && now >= start_ - 15 * 60000 && now <= end + 15 * 60000;
  const started = now >= start_;
  const ended = now >= end;

  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r?.ok) {
        setPanel(null);
        setNote("");
      }
    });

  const d = new Date(s.start_at);
  const month = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short" }).format(d);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(d);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);

  let statusLine: string | null = null;
  if (s.status === "pending") {
    statusLine = s.awaiting_me
      ? s.proposed_by === "family"
        ? `${s.student_name} requested this time.`
        : `${s.tutor_name} suggested this time.`
      : `Waiting for ${isTutor ? s.student_name : s.tutor_name} to respond.`;
  }

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
            <Badge tone={sessionTone(s.status)} dot>
              {SESSION_STATUS_LABEL[s.status] ?? s.status}
            </Badge>
            {s.awaiting_me && <Badge tone="brass">Needs you</Badge>}
          </div>
          <h3 className="mt-2 text-[15px] font-semibold leading-snug">
            {s.subject_name} with {other}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-muted">
            <Clock className="size-3.5" />
            {formatTime(s.start_at)}–{formatTime(s.end_at)} ET · {s.duration_minutes} min
          </p>
          {statusLine && <p className="mt-2 text-[13.5px] text-ink-2">{statusLine}</p>}
          {s.request_note && s.status === "pending" && <p className="mt-1.5 rounded-lg bg-paper-2 px-3 py-2 text-[13px] text-ink-2">“{s.request_note}”</p>}
          {s.status === "declined" && s.decline_reason && <p className="mt-1.5 text-[13px] text-muted">Note: “{s.decline_reason}”</p>}
          {s.status === "cancelled" && s.cancel_reason && <p className="mt-1.5 text-[13px] text-muted">Reason: “{s.cancel_reason}”</p>}
          {s.status === "completed" && !isTutor && (
            <p className="mt-2 text-[13.5px] text-ink-2">{s.tutor_name} logged this lesson. Did it happen?</p>
          )}
          {s.status === "completed" && isTutor && <p className="mt-2 text-[13.5px] text-muted">Waiting for {s.student_name}’s side to confirm it happened.</p>}
          {s.status === "confirmed" && <p className="mt-2 text-[13.5px] text-muted">Confirmed by {isTutor ? `${s.student_name}’s side` : "you"} — waiting for weekly verification.</p>}
          {s.status === "verified" && (
            <p className="mt-2 flex items-center gap-1.5 text-[13.5px] text-pine-800">
              <BadgeCheck className="size-4" /> Verified{s.verifier_org ? ` by ${s.verifier_org}` : ""}
            </p>
          )}
          {s.status === "disputed" && <p className="mt-2 text-[13.5px] text-clay-800">{isTutor ? `${s.student_name}’s side` : "You"} said this lesson didn’t happen. The program team is reviewing it.</p>}
          {s.status === "rejected" && s.review_note && <p className="mt-2 text-[13.5px] text-clay-800">Not verified: “{s.review_note}”</p>}
        </div>
        <div className="hidden shrink-0 sm:block">
          <Avatar name={isTutor ? s.student_name : s.tutor_name} path={isTutor ? null : s.tutor_avatar} size={40} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper/50 px-4 py-3 sm:px-5">
        {s.status === "pending" && s.awaiting_me && (
          <>
            <Button size="sm" pending={pending && panel === null} onClick={() => run(() => respondLesson({ sessionId: s.id, action: "accept" }))}>
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
        {s.status === "scheduled" && (
          <>
            {s.meet_url && (
              <a
                href={s.meet_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition",
                  canJoin ? "bg-pine-700 text-white hover:bg-pine-800" : "border border-line-2 bg-card text-ink-2 hover:border-ink/30",
                )}
              >
                <Video className="size-4" /> {canJoin ? "Join Google Meet" : "Meet link"}
              </a>
            )}
            {isTutor && ended && (
              <>
                <Button size="sm" pending={pending && panel === null} onClick={() => run(() => logLesson({ sessionId: s.id, happened: true }))}>
                  <CheckCircle2 className="size-4" /> It happened
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "log-no" ? null : "log-no")}>
                  It didn’t happen
                </Button>
              </>
            )}
            {!started && (
              <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>
                Cancel lesson
              </Button>
            )}
          </>
        )}
        {s.status === "completed" && !isTutor && (
          <>
            <Button size="sm" pending={pending && panel === null} onClick={() => run(() => confirmLesson({ sessionId: s.id, happened: true }))}>
              <CheckCircle2 className="size-4" /> Yes, it happened
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "confirm-no" ? null : "confirm-no")}>
              <XCircle className="size-4" /> No, it didn’t
            </Button>
          </>
        )}
        {s.thread_id && (
          <Link href={`/dashboard/messages/${s.thread_id}`} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-paper-2 hover:text-ink">
            <MessageCircle className="size-4" /> Message
          </Link>
        )}
      </div>

      {panel && (
        <div className="animate-fade border-t border-line px-4 py-4 sm:px-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {panel === "counter" && "Suggest a different time"}
              {panel === "decline" && "Decline this request"}
              {panel === "cancel" && (s.status === "pending" ? "Withdraw this request" : "Cancel this lesson")}
              {panel === "log-no" && "What happened?"}
              {panel === "confirm-no" && "Tell us what happened"}
            </p>
            <button type="button" onClick={() => setPanel(null)} className="rounded-full p-1 text-muted hover:bg-paper-2" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {panel === "counter" && <DateTimeFields value={dt} onChange={setDt} min={easternDateOffset(0)} max={easternDateOffset(89)} />}
          {panel === "cancel" && s.status === "scheduled" && start_ - now < 24 * 3600000 && (
            <Notice tone="warning" className="mb-3">
              This lesson is less than 24 hours away. Please also send a quick message so they aren’t waiting.
            </Notice>
          )}
          {panel === "confirm-no" && (
            <p className="mb-2 text-[13px] text-muted">This flags the lesson for review — it won’t count toward the tutor’s hours. If something made you uncomfortable, please also use “Report a concern.”</p>
          )}
          <Textarea
            className="mt-3 min-h-16"
            placeholder={panel === "confirm-no" ? "Required: briefly, what happened?" : "Optional note (no contact info)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              Never mind
            </Button>
            <Button
              size="sm"
              variant={panel === "counter" ? "primary" : "danger"}
              pending={pending}
              onClick={() =>
                run(() => {
                  if (panel === "counter") return respondLesson({ sessionId: s.id, action: "counter", ...dt, note });
                  if (panel === "decline") return respondLesson({ sessionId: s.id, action: "decline", note });
                  if (panel === "cancel") return cancelLesson({ sessionId: s.id, reason: note });
                  if (panel === "log-no") return logLesson({ sessionId: s.id, happened: false, note });
                  return confirmLesson({ sessionId: s.id, happened: false, note });
                })
              }
            >
              {panel === "counter" ? "Send new time" : panel === "decline" ? "Decline" : panel === "cancel" ? "Confirm cancel" : "Submit"}
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
