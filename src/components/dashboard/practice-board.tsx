"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Flame, MessageCircle, Pencil, PartyPopper, Repeat, Trash2 } from "lucide-react";
import { removePractice, setPracticeDone, updatePractice } from "@/app/actions/practice";
import {
  dailyEnded,
  dueState,
  easternDate,
  formatDue,
  groupBoard,
  lastDays,
  practiceDays,
  practiceStreak,
  practiceProblem,
  tickedOn,
  TASK_MAX,
  NOTE_MAX,
  type BoardGroup,
  type PracticeItem,
} from "@/lib/practice";
import { PracticeWeek } from "@/components/dashboard/practice-week";
import { formatDate, formatRelative } from "@/lib/time";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";

const DUE_TONE = { overdue: "clay", today: "brass", soon: "brass", later: "neutral" } as const;

function DueBadge({ due }: { due: string }) {
  const state = dueState(due)!;
  return (
    <Badge tone={DUE_TONE[state]}>
      {state === "overdue" ? `Was due ${formatDue(due)}` : state === "today" ? "Due today" : `Due ${formatDue(due)}`}
    </Badge>
  );
}

/**
 * The practice board. `view="family"`: the student ticks tasks off.
 * `view="tutor"`: the tutor sees what's done and can fix or remove what they wrote.
 * `limit` shows only the first few open tasks per group (the home page).
 */
export function PracticeBoard({ items, view, limit, showStudent }: { items: PracticeItem[]; view: "family" | "tutor"; limit?: number; showStudent?: boolean }) {
  // Ticks show at once; the server confirms (or we put it back and say why).
  const [done, setDone] = useState<Record<string, string | null>>({});
  // A daily task's tick for today: true/false while the server catches up.
  const [today, setToday] = useState<Record<string, boolean>>({});
  const [gone, setGone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const day = easternDate(0);
  const live = items
    .filter((i) => !gone.includes(i.id))
    .map((i) => (i.id in done ? { ...i, done_at: done[i.id] } : i))
    .map((i) =>
      i.id in today ? { ...i, checks: today[i.id] ? [...new Set([...(i.checks ?? []), day])].sort() : (i.checks ?? []).filter((c) => c !== day) } : i,
    );
  const groups = groupBoard(live, day);

  const toggle = (it: PracticeItem) => {
    setError(null);
    if (it.repeat === "daily") {
      const next = !tickedOn(it, day);
      setToday((t) => ({ ...t, [it.id]: next }));
      start(async () => {
        const r = await setPracticeDone(it.id, next);
        if (!r?.ok) {
          setToday((t) => ({ ...t, [it.id]: !next }));
          setError(r?.error.message ?? "Couldn’t save that. Please try again.");
        }
      });
      return;
    }
    const next = it.done_at ? null : new Date().toISOString();
    setDone((d) => ({ ...d, [it.id]: next }));
    start(async () => {
      const r = await setPracticeDone(it.id, Boolean(next));
      if (!r?.ok) {
        setDone((d) => ({ ...d, [it.id]: it.done_at }));
        setError(r?.error.message ?? "Couldn’t save that. Please try again.");
      }
    });
  };
  const remove = (it: PracticeItem) =>
    start(async () => {
      setGone((g) => [...g, it.id]);
      const r = await removePractice(it.id);
      if (!r?.ok) {
        setGone((g) => g.filter((x) => x !== it.id));
        setError(r?.error.message ?? "Couldn’t remove that.");
      }
    });

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-clay-50 px-3 py-2 text-[13px] text-clay-800">
          {error}
        </p>
      )}
      {groups.map((g) => (
        <Group key={g.key} g={g} view={view} limit={limit} showStudent={showStudent} onToggle={toggle} onRemove={remove} />
      ))}
    </div>
  );
}

function Group({
  g,
  view,
  limit,
  showStudent,
  onToggle,
  onRemove,
}: {
  g: BoardGroup;
  view: "family" | "tutor";
  limit?: number;
  showStudent?: boolean;
  onToggle: (it: PracticeItem) => void;
  onRemove: (it: PracticeItem) => void;
}) {
  const total = g.open.length + g.done.length;
  // Today's share: one-off tasks done, plus daily tasks ticked today.
  const todo = g.onceTotal + g.dailyToday;
  const pct = todo ? Math.round(((g.onceDone + g.dailyTicked) / todo) * 100) : 0;
  const tasks = [...g.open, ...g.done];
  const streak = practiceStreak(tasks);
  const dailyDone = g.dailyToday > 0 && g.dailyTicked >= g.dailyToday;
  const summary = [
    g.dailyToday > 0 && `${g.dailyTicked} of ${g.dailyToday} daily done today`,
    g.onceTotal > 0 && `${g.onceDone} of ${g.onceTotal} ${g.onceTotal === 1 ? "task" : "tasks"} done`,
  ].filter(Boolean);
  const open = limit ? g.open.slice(0, limit) : g.open;
  const [latest, ...older] = g.notes;
  const title = view === "tutor" ? g.studentName : `${g.subjectName ?? "Lessons"} with ${g.tutorName}`;

  return (
    <article className="animate-rise rounded-[22px] border border-line bg-card p-4 shadow-card sm:p-5">
      <header className="flex items-center gap-3">
        <Avatar name={view === "tutor" ? g.studentName : g.tutorName} path={view === "tutor" ? null : g.tutorAvatar} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{title}</h3>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {summary.length ? summary.join(" · ") : "Notes"}
            {showStudent && view === "family" && ` · ${g.studentName}`}
          </p>
        </div>
        {streak > 1 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-brass-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-brass-800" title={`Practised ${streak} days in a row`}>
            <Flame className="size-3.5" aria-hidden />
            {streak}
            <span className="sr-only"> days in a row</span>
          </span>
        )}
        {g.threadId && (
          <Link
            href={`/dashboard/messages/${g.threadId}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-2 text-ink-2 hover:border-ink/30 hover:text-ink"
            aria-label={`Message ${view === "tutor" ? g.studentName : g.tutorName}`}
            title="Message"
          >
            <MessageCircle className="size-4" aria-hidden />
          </Link>
        )}
      </header>
      {todo > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Practice done">
          <div className="h-full rounded-full bg-pine-700 transition-[width] duration-500 ease-[cubic-bezier(0.3,1.4,0.5,1)]" style={{ width: `${pct}%` }} />
        </div>
      )}

      {latest && (
        <div className="mt-4 rounded-2xl bg-paper-2/70 px-4 py-3">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
            {view === "tutor" ? "Your note" : `Note from ${g.tutorName}`} · {formatDate(latest.created_at)}
          </p>
          <ItemBody it={latest} view={view} onRemove={onRemove} className="mt-1 whitespace-pre-line text-[14.5px] leading-relaxed text-ink-2" />
          {older.length > 0 && (
            <details className="mt-2 text-[13.5px]">
              <summary className="cursor-pointer text-muted hover:text-ink">Earlier notes ({older.length})</summary>
              <ul className="mt-2 space-y-2 animate-fade">
                {older.map((n) => (
                  <li key={n.id} className="border-l-2 border-line-2 pl-3">
                    <p className="text-[11.5px] text-faint">{formatDate(n.created_at)}</p>
                    <ItemBody it={n} view={view} onRemove={onRemove} className="whitespace-pre-line text-ink-2" />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {tasks.length > 0 && !limit && (
        <PracticeWeek days={practiceDays(tasks, lastDays(7))} className="mt-3" label={`${g.studentName}'s practice this week`} />
      )}
      {dailyDone && (
        <p className="mt-3 flex animate-fade items-center gap-2 rounded-2xl bg-mint/50 px-4 py-2.5 text-[13.5px] text-pine-900">
          <PartyPopper className="size-4 shrink-0" aria-hidden />
          {view === "tutor" ? `${g.studentName} has practised everything for today.` : "Today’s practice is done. See you tomorrow!"}
        </p>
      )}
      {g.open.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {open.map((it) => (
            <TaskRow key={it.id} it={it} view={view} onToggle={onToggle} onRemove={onRemove} />
          ))}
        </ul>
      ) : total > 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-mint/50 px-4 py-3 text-[14px] text-pine-900">
          <PartyPopper className="size-4 shrink-0" aria-hidden />
          {view === "tutor" ? `${g.studentName} has done every task.` : "All done — nice work! Your tutor can see it."}
        </p>
      ) : null}
      {limit && g.open.length > limit && <p className="mt-2 text-[13px] text-muted">+{g.open.length - limit} more on the practice board</p>}

      {!limit && g.done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] font-medium text-muted hover:text-ink">Done ({g.done.length})</summary>
          <ul className="mt-1 divide-y divide-line animate-fade">
            {g.done.map((it) => (
              <TaskRow key={it.id} it={it} view={view} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function TaskRow({ it, view, onToggle, onRemove }: { it: PracticeItem; view: "family" | "tutor"; onToggle: (it: PracticeItem) => void; onRemove: (it: PracticeItem) => void }) {
  if (it.repeat === "daily") return <DailyRow it={it} view={view} onToggle={onToggle} onRemove={onRemove} />;
  const isDone = Boolean(it.done_at);
  return (
    <li className="flex items-start gap-3 py-2.5">
      {view === "family" ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-label={`${isDone ? "Mark not done" : "Mark done"}: ${it.body}`}
          onClick={() => onToggle(it)}
          className={cn(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-[background,border-color,transform] duration-200 ease-[cubic-bezier(0.3,1.4,0.5,1)] active:scale-[0.9]",
            isDone ? "border-pine-700 bg-pine-700 text-white" : "border-ink/25 bg-white hover:border-pine-700",
          )}
        >
          {isDone && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
        </button>
      ) : (
        <span
          className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2", isDone ? "border-pine-700 bg-pine-700 text-white" : "border-ink/20")}
          aria-label={isDone ? "Done" : "Not done yet"}
          role="img"
        >
          {isDone && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <ItemBody it={it} view={view} onRemove={onRemove} className={cn("text-[14.5px] leading-snug", isDone && "text-muted line-through decoration-ink/30")} />
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          {isDone ? <span>Done {formatRelative(it.done_at!)}</span> : it.due_on && <DueBadge due={it.due_on} />}
          {it.session_id && it.session_start && (
            <Link href={`/dashboard/lessons/${it.session_id}`} className="underline decoration-ink/20 underline-offset-2 hover:text-ink">
              From the {formatDate(it.session_start).replace(/, \d{4}$/, "")} lesson
            </Link>
          )}
        </p>
      </div>
    </li>
  );
}

/** A task practised every day: today's tick, and the last week of ticks. */
function DailyRow({ it, view, onToggle, onRemove }: { it: PracticeItem; view: "family" | "tutor"; onToggle: (it: PracticeItem) => void; onRemove: (it: PracticeItem) => void }) {
  const today = easternDate(0);
  const ended = dailyEnded(it, today);
  const ticked = tickedOn(it, today);
  const week = practiceDays([it], lastDays(7, today));
  const ran = week.filter((d) => d.daily > 0);
  const practised = ran.filter((d) => d.ticked > 0).length;
  const total = (it.checks ?? []).length;
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        {view === "family" && !ended ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={ticked}
            aria-label={`${ticked ? "Not practised today" : "Practised today"}: ${it.body}`}
            onClick={() => onToggle(it)}
            className={cn(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-[background,border-color,transform] duration-200 ease-[cubic-bezier(0.3,1.4,0.5,1)] active:scale-[0.9]",
              ticked ? "border-pine-700 bg-pine-700 text-white" : "border-ink/25 bg-white hover:border-pine-700",
            )}
          >
            {ticked && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
          </button>
        ) : (
          <span
            className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border-2", ticked ? "border-pine-700 bg-pine-700 text-white" : "border-ink/20")}
            aria-label={ended ? "Finished" : ticked ? "Practised today" : "Not practised yet today"}
            role="img"
          >
            {ticked && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <ItemBody it={it} view={view} onRemove={onRemove} className="text-[14.5px] leading-snug" />
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
            <Badge tone="pine">
              <Repeat className="size-3" aria-hidden /> Every day
            </Badge>
            {ended ? (
              <span>
                Finished {formatDue(it.due_on!)} · practised on {total} {total === 1 ? "day" : "days"}
              </span>
            ) : (
              <>
                {it.due_on && <span>until {it.due_on === today ? "today" : formatDue(it.due_on)}</span>}
                {view === "family" && !ticked && <span className="text-ink-2">Tick it once you’ve practised today</span>}
              </>
            )}
          </p>
        </div>
      </div>
      {!ended && ran.length > 1 && (
        <div className="ml-9 mt-2 flex items-center gap-2.5">
          <PracticeWeek days={week} today={today} size="sm" label={`${it.body}: the last 7 days`} />
          <span className="text-[12px] text-muted">
            {practised} of {ran.length} days
          </span>
        </div>
      )}
    </li>
  );
}

/** The text of a task or note; for the tutor, with edit and remove. */
function ItemBody({ it, view, onRemove, className }: { it: PracticeItem; view: "family" | "tutor"; onRemove: (it: PracticeItem) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(it.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (view !== "tutor") return <p className={className}>{it.body}</p>;
  const problem = text.trim() ? practiceProblem(text) : null;
  if (editing)
    return (
      <form
        className="space-y-2 animate-fade"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updatePractice({ id: it.id, body: text, due: it.due_on });
            if (r?.ok) setEditing(false);
            else setError(r?.error.message ?? "Couldn’t save.");
          });
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={it.kind === "task" ? TASK_MAX : NOTE_MAX}
          rows={it.kind === "task" ? 2 : 4}
          className="min-h-0 text-[14px]"
          aria-label={it.kind === "task" ? "Edit task" : "Edit note"}
          aria-invalid={Boolean(problem)}
          autoFocus
        />
        {(problem || error) && (
          <p role="alert" className="text-[12.5px] text-clay-700">
            {problem ?? error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" pending={pending} disabled={!text.trim() || Boolean(problem)}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setText(it.body);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  return (
    <div className="group flex items-start gap-2">
      <p className={cn("min-w-0 flex-1", className)}>{it.body}</p>
      <span className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" onClick={() => setEditing(true)} className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink" aria-label={`Edit: ${it.body}`}>
          <Pencil className="size-3.5" />
        </button>
        <button type="button" onClick={() => onRemove(it)} className="rounded-full p-1.5 text-muted hover:bg-clay-50 hover:text-clay-700" aria-label={`Remove: ${it.body}`}>
          <Trash2 className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
