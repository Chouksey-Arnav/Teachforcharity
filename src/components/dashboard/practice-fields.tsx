"use client";
import { useRef, useState, useTransition } from "react";
import { Plus, Send, X } from "lucide-react";
import { assignPractice } from "@/app/actions/practice";
import { NOTE_MAX, QUICK_TASKS, TASK_MAX, TASKS_PER_SEND, cleanTasks, draftProblem, easternDate, formatDue, practiceProblem } from "@/lib/practice";
import type { ActionState } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";

export interface PracticeDraft {
  tasks: string[];
  note: string;
  /** "YYYY-MM-DD" or "" for no date. */
  due: string;
}

export const emptyDraft = (): PracticeDraft => ({ tasks: [""], note: "", due: "" });

/** True when the tutor has written anything worth sending. */
export const draftHasContent = (d: PracticeDraft) => cleanTasks(d.tasks).length > 0 || d.note.trim().length > 0;

/**
 * Homework entry built for speed: Enter starts the next task, Backspace on an
 * empty task removes it, pasting a list makes one task per line. Every line is
 * checked as it's typed with the same rules the database applies.
 */
export function PracticeFields({
  value,
  onChange,
  studentName,
  nextLesson,
  idPrefix,
}: {
  value: PracticeDraft;
  onChange: (d: PracticeDraft) => void;
  studentName: string;
  /** "YYYY-MM-DD" of the next booked lesson together, for the "By next lesson" due date. */
  nextLesson?: string | null;
  idPrefix: string;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number, end = true) =>
    requestAnimationFrame(() => {
      const el = inputs.current[i];
      if (!el) return;
      el.focus();
      if (end) el.setSelectionRange(el.value.length, el.value.length);
    });
  const setTasks = (tasks: string[]) => onChange({ ...value, tasks: tasks.length ? tasks : [""] });
  const setTask = (i: number, text: string) => setTasks(value.tasks.map((t, j) => (j === i ? text : t)));
  const insertAfter = (i: number, text = "") => {
    if (value.tasks.length >= TASKS_PER_SEND) return;
    setTasks([...value.tasks.slice(0, i + 1), text, ...value.tasks.slice(i + 1)]);
    focus(i + 1);
  };
  const remove = (i: number) => {
    setTasks(value.tasks.filter((_, j) => j !== i));
    focus(Math.max(0, i - 1));
  };
  const quick = (text: string) => {
    const empty = value.tasks.findIndex((t) => !t.trim());
    if (empty >= 0) {
      setTask(empty, text);
      focus(empty);
    } else insertAfter(value.tasks.length - 1, text);
  };

  const weekOut = easternDate(7);
  const dues: { label: string; value: string }[] = [
    { label: "No due date", value: "" },
    ...(nextLesson && nextLesson >= easternDate(0) ? [{ label: `By next lesson · ${formatDue(nextLesson)}`, value: nextLesson }] : []),
    ...(weekOut !== nextLesson ? [{ label: `In a week · ${formatDue(weekOut)}`, value: weekOut }] : []),
  ];
  const noteProblem = value.note.trim() ? practiceProblem(value.note) : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[14px] font-semibold">Practice tasks</p>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">Enter for the next one</p>
        </div>
        <ol className="mt-2 space-y-2">
          {value.tasks.map((t, i) => {
            const problem = t.trim() ? practiceProblem(t) : null;
            const id = `${idPrefix}-task-${i}`;
            return (
              <li key={i}>
                <div className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-right font-mono text-[11px] text-faint" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <label htmlFor={id} className="sr-only">
                    Task {i + 1}
                  </label>
                  <input
                    id={id}
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    value={t}
                    maxLength={TASK_MAX}
                    placeholder={i === 0 ? "e.g. Long tones, 5 minutes a day" : "Another task"}
                    aria-invalid={Boolean(problem)}
                    aria-describedby={problem ? `${id}-problem` : undefined}
                    onChange={(e) => setTask(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (t.trim()) insertAfter(i);
                      } else if (e.key === "Backspace" && !t && value.tasks.length > 1) {
                        e.preventDefault();
                        remove(i);
                      }
                    }}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (!text.includes("\n")) return;
                      e.preventDefault();
                      const lines = cleanTasks([text]);
                      const merged = [...value.tasks.slice(0, i), ...(t.trim() ? [t] : []), ...lines, ...value.tasks.slice(i + 1)].slice(0, TASKS_PER_SEND);
                      setTasks(merged);
                      focus(Math.min(merged.length - 1, i + lines.length));
                    }}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-ink/14 bg-white/85 px-3.5 text-[15px] text-ink placeholder:text-faint transition-[border-color,box-shadow] hover:border-ink/25 focus:border-ink/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-glow/50 aria-[invalid=true]:border-clay-500"
                  />
                  {value.tasks.length > 1 && (
                    <button type="button" onClick={() => remove(i)} className="shrink-0 rounded-full p-1.5 text-faint hover:bg-ink/5 hover:text-ink" aria-label={`Remove task ${i + 1}`}>
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                {problem && (
                  <p id={`${id}-problem`} role="alert" className="ml-8 mt-1 text-[12.5px] text-clay-700">
                    {problem}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        <div className="ml-8 mt-2 flex flex-wrap items-center gap-1.5">
          {value.tasks.length < TASKS_PER_SEND && (
            <button
              type="button"
              onClick={() => insertAfter(value.tasks.length - 1)}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-pine-800 hover:bg-pine-50"
            >
              <Plus className="size-3.5" /> Add a task
            </button>
          )}
          {QUICK_TASKS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => quick(q)}
              className="h-8 rounded-full border border-line-2 bg-paper/60 px-3 text-[12.5px] text-ink-2 transition hover:border-pine-600 hover:bg-pine-50 hover:text-pine-800"
            >
              {q.replace(/[: ]+$/, "")}
            </button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="text-[14px] font-semibold">Due</legend>
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup">
          {dues.map((d) => (
            <button
              key={d.label}
              type="button"
              role="radio"
              aria-checked={value.due === d.value}
              onClick={() => onChange({ ...value, due: d.value })}
              className={cn(
                "h-9 rounded-full border px-3.5 text-[13px] font-medium transition",
                value.due === d.value ? "border-ink bg-ink text-cream" : "border-line-2 bg-white/70 text-ink-2 hover:border-ink/30",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${idPrefix}-note`} className="text-[14px] font-semibold">
            Note to {studentName}
          </label>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">Optional</span>
        </div>
        <Textarea
          id={`${idPrefix}-note`}
          className="mt-1.5 min-h-20"
          rows={3}
          maxLength={NOTE_MAX}
          value={value.note}
          aria-invalid={Boolean(noteProblem)}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          placeholder="What went well, what to listen for, a reminder for next time…"
        />
        {noteProblem ? (
          <p role="alert" className="mt-1 text-[12.5px] text-clay-700">
            {noteProblem}
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] text-muted">It goes on {studentName}’s practice board. A parent can read it too.</p>
        )}
      </div>
    </div>
  );
}

/** The composer on its own (lesson page, student page, a logged lesson's card). */
export function PracticeComposer({
  studentId,
  studentName,
  sessionId,
  nextLesson,
  onDone,
  idPrefix,
}: {
  studentId: string;
  studentName: string;
  sessionId?: string;
  nextLesson?: string | null;
  onDone?: () => void;
  idPrefix: string;
}) {
  const [draft, setDraft] = useState<PracticeDraft>(emptyDraft);
  const [result, setResult] = useState<ActionState<{ added: number }>>(null);
  const [pending, start] = useTransition();
  const problem = draftHasContent(draft) ? draftProblem(draft.tasks, draft.note) : null;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await assignPractice({ studentId, sessionId, tasks: draft.tasks, note: draft.note, due: draft.due || undefined });
          setResult(r);
          if (r?.ok) {
            setDraft(emptyDraft());
            onDone?.();
          }
        });
      }}
    >
      <PracticeFields value={draft} onChange={setDraft} studentName={studentName} nextLesson={nextLesson} idPrefix={idPrefix} />
      {result && (result.ok ? <Notice tone="success" className="animate-rise">{result.message}</Notice> : <Notice tone="danger">{result.error.message}</Notice>)}
      <div className="flex justify-end">
        <Button type="submit" size="sm" pending={pending} disabled={!draftHasContent(draft) || Boolean(problem)}>
          <Send className="size-4" /> Send to {studentName}’s board
        </Button>
      </div>
    </form>
  );
}
