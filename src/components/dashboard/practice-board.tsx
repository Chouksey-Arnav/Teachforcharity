"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, MessageCircle, Pencil, PartyPopper, Trash2 } from "lucide-react";
import { removePractice, setPracticeDone, updatePractice } from "@/app/actions/practice";
import { dueState, formatDue, groupBoard, practiceProblem, TASK_MAX, NOTE_MAX, type BoardGroup, type PracticeItem } from "@/lib/practice";
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
  const [gone, setGone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const live = items
    .filter((i) => !gone.includes(i.id))
    .map((i) => (i.id in done ? { ...i, done_at: done[i.id] } : i));
  const groups = groupBoard(live);

  const toggle = (it: PracticeItem) => {
    const next = it.done_at ? null : new Date().toISOString();
    setDone((d) => ({ ...d, [it.id]: next }));
    setError(null);
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
  const pct = total ? Math.round((g.done.length / total) * 100) : 0;
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
            {total ? `${g.done.length} of ${total} done` : "Notes"}
            {showStudent && view === "family" && ` · ${g.studentName}`}
          </p>
        </div>
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
      {total > 0 && (
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
