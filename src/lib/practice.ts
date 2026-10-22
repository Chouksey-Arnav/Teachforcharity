/**
 * The practice board: homework tasks and notes a tutor leaves for a student.
 * Pure helpers shared by the composer, the board and the server actions.
 */
import { messageViolation } from "./moderation";

export const TASK_MAX = 200;
export const NOTE_MAX = 1000;
export const TASKS_PER_SEND = 12;

export interface PracticeItem {
  id: string;
  kind: "task" | "note";
  body: string;
  due_on: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
  tutor_id: string;
  tutor_name: string;
  tutor_avatar: string | null;
  student_id: string;
  student_name: string;
  subject_name: string | null;
  session_id: string | null;
  session_start: string | null;
  thread_id: string | null;
  my_side: "tutor" | "family";
  /** "once": ticked off when it's done. "daily": practised every day until it's due, one tick a day. */
  repeat: "once" | "daily";
  /** The Eastern day it was set ("2026-10-15"). */
  created_on: string;
  /** A daily task's ticked days (the last 60), oldest first; null for anything else. */
  checks: string[] | null;
}

/**
 * The tasks a tutor typed, cleaned up: one per line (pasting a list works),
 * bullets and numbering dropped, blanks removed, whitespace collapsed.
 */
export function cleanTasks(lines: string[]): string[] {
  return lines
    .flatMap((l) => (l ?? "").split(/\r?\n/))
    .map((l) =>
      l
        .replace(/^\s*(?:[-*•·◦▪]|\d{1,2}[.)]|\[\s?[xX ]?\s?\])\s+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * The tasks with their "every day" flags, cleaned like cleanTasks (a pasted
 * list keeps its line's flag). A flag of null follows the wording (looksDaily).
 */
export function cleanDraftTasks(tasks: string[], daily: (boolean | null | undefined)[] = []): { text: string; daily: boolean }[] {
  return tasks.flatMap((t, i) => cleanTasks([t]).map((text) => ({ text, daily: daily[i] ?? looksDaily(text) })));
}

/** Why a task or note can't be sent (as a tutor's words), or null. Mirrors the database gate. */
export function practiceProblem(text: string): string | null {
  const why = messageViolation(text, "tutor");
  return why ? `Can’t include ${why}.` : null;
}

/** Everything wrong with a draft before it's sent, or null. */
export function draftProblem(tasks: string[], note: string): string | null {
  const t = cleanTasks(tasks);
  if (!t.length && !note.trim()) return "Add at least one task or a note.";
  if (t.length > TASKS_PER_SEND) return `Add up to ${TASKS_PER_SEND} tasks at a time.`;
  const long = t.findIndex((x) => x.length > TASK_MAX);
  if (long >= 0) return `Task ${long + 1} is too long — keep each under ${TASK_MAX} characters.`;
  if (note.trim().length > NOTE_MAX) return `Keep the note under ${NOTE_MAX.toLocaleString()} characters.`;
  const bad = t.findIndex((x) => practiceProblem(x));
  if (bad >= 0) return `Task ${bad + 1}: ${practiceProblem(t[bad])}`;
  if (note.trim() && practiceProblem(note)) return `The note: ${practiceProblem(note)}`;
  return null;
}

/** Text that reads like everyday practice ("5 minutes a day", "daily"): the composer suggests "Every day" for it. */
export function looksDaily(text: string): boolean {
  return /\b(?:daily|every\s*day|each\s*day|(?:a|per)\s+day|every\s+night|nightly)\b/i.test(text);
}

/** Ready-made starts for common homework. The tutor edits the details. */
export const QUICK_TASKS = [
  "Long tones, 5 minutes a day",
  "Scales: ",
  "Etude: ",
  "Piece, measures ",
  "Slow practice with a metronome at ",
  "Listen to a recording of ",
] as const;

/** "2026-10-15" in Eastern time, `days` from now. */
export function easternDate(days: number, from: Date = new Date()): string {
  const d = new Date(from.getTime() + days * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "Thu, Oct 15" for a plain date (no time zone shifting). */
export function formatDue(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export type DueState = "overdue" | "today" | "soon" | "later" | null;

export function dueState(due: string | null, today: string = easternDate(0)): DueState {
  if (!due) return null;
  if (due < today) return "overdue";
  if (due === today) return "today";
  return due <= easternDate(2, new Date(`${today}T12:00:00Z`)) ? "soon" : "later";
}

export interface BoardGroup {
  key: string;
  tutorId: string;
  tutorName: string;
  tutorAvatar: string | null;
  studentId: string;
  studentName: string;
  subjectName: string | null;
  threadId: string | null;
  /** Newest first. */
  notes: PracticeItem[];
  /** To do: daily tasks still running first, then one-off tasks by due date, then newest. */
  open: PracticeItem[];
  /** Done: one-off tasks most recently ticked first, then daily tasks that have finished. */
  done: PracticeItem[];
  latestAt: string;
  /** One-off tasks done, of all one-off tasks. */
  onceDone: number;
  onceTotal: number;
  /** Daily tasks running today, and how many of them are ticked today. */
  dailyToday: number;
  dailyTicked: number;
}

/** One group per tutor and student, the busiest (most recent) first. */
export function groupBoard(items: PracticeItem[], today: string = easternDate(0)): BoardGroup[] {
  const groups = new Map<string, BoardGroup>();
  for (const it of items) {
    const key = `${it.tutor_id}:${it.student_id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        tutorId: it.tutor_id,
        tutorName: it.tutor_name,
        tutorAvatar: it.tutor_avatar,
        studentId: it.student_id,
        studentName: it.student_name,
        subjectName: it.subject_name,
        threadId: it.thread_id,
        notes: [],
        open: [],
        done: [],
        latestAt: it.created_at,
        onceDone: 0,
        onceTotal: 0,
        dailyToday: 0,
        dailyTicked: 0,
      };
      groups.set(key, g);
    }
    if (it.created_at > g.latestAt) g.latestAt = it.created_at;
    if (it.kind === "note") g.notes.push(it);
    else if (it.repeat === "daily") {
      if (dailyEnded(it, today)) g.done.push(it);
      else {
        g.open.push(it);
        g.dailyToday++;
        if (tickedOn(it, today)) g.dailyTicked++;
      }
    } else {
      g.onceTotal++;
      if (it.done_at) {
        g.onceDone++;
        g.done.push(it);
      } else g.open.push(it);
    }
  }
  const daily = (x: PracticeItem) => (x.repeat === "daily" ? 0 : 1);
  for (const g of groups.values()) {
    g.notes.sort((a, b) => b.created_at.localeCompare(a.created_at));
    g.open.sort((a, b) => daily(a) - daily(b) || (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || b.created_at.localeCompare(a.created_at));
    g.done.sort((a, b) => daily(b) - daily(a) || (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  }
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

// ---------------------------------------------------------------------------
// Day by day: what the tutor sees, and the student's week
// ---------------------------------------------------------------------------

/** The plain date `n` days after `day` ("2026-10-15" + 1 = "2026-10-16"). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The last `n` days ending with `today`, oldest first. */
export function lastDays(n: number, today: string = easternDate(0)): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

/** A daily task has finished once its due date has passed. */
export const dailyEnded = (it: PracticeItem, today: string = easternDate(0)) => it.repeat === "daily" && Boolean(it.due_on) && it.due_on! < today;

/** Was this daily task running on `day`: from the day it was set through its due date? */
export const runsOn = (it: PracticeItem, day: string) =>
  it.kind === "task" && it.repeat === "daily" && it.created_on <= day && (!it.due_on || day <= it.due_on);

export const tickedOn = (it: PracticeItem, day: string) => Boolean(it.checks?.includes(day));

/** The Eastern day a one-off task was ticked off, or null. */
export const finishedOn = (it: PracticeItem) => (it.kind === "task" && it.repeat === "once" && it.done_at ? easternDate(0, new Date(it.done_at)) : null);

export interface DayProgress {
  day: string;
  /** Daily tasks that were running that day, and how many were ticked. */
  daily: number;
  ticked: number;
  /** One-off tasks ticked off that day. */
  finished: number;
}

export type DayState = "full" | "partial" | "missed" | "finished" | "waiting" | "none";

/**
 * How a day went, for the week strip:
 * full = every daily task ticked, partial = some, missed = none (a past day),
 * waiting = today with nothing ticked yet, finished = no daily tasks but a task
 * was finished, none = nothing to practise.
 */
export function dayState(p: DayProgress, today: string = easternDate(0)): DayState {
  if (p.daily > 0) {
    if (p.ticked >= p.daily) return "full";
    if (p.ticked > 0) return "partial";
    return p.day >= today ? (p.finished > 0 ? "finished" : "waiting") : p.finished > 0 ? "finished" : "missed";
  }
  return p.finished > 0 ? "finished" : "none";
}

/** Practice, day by day, for the given days (one student's items, or one task). */
export function practiceDays(items: PracticeItem[], days: string[]): DayProgress[] {
  return days.map((day) => {
    let daily = 0;
    let ticked = 0;
    let finished = 0;
    for (const it of items) {
      if (runsOn(it, day)) {
        daily++;
        if (tickedOn(it, day)) ticked++;
      }
      if (finishedOn(it) === day) finished++;
    }
    return { day, daily, ticked, finished };
  });
}

/** A day the student did something: ticked a daily task or finished one. */
const practised = (p: DayProgress) => p.ticked > 0 || p.finished > 0;

/** Days in a row with some practice, ending today (or yesterday, while today is still open). */
export function practiceStreak(items: PracticeItem[], today: string = easternDate(0)): number {
  const days = practiceDays(items, lastDays(61, today)).reverse();
  let i = practised(days[0]) ? 0 : 1;
  let n = 0;
  while (i < days.length && practised(days[i])) {
    n++;
    i++;
  }
  return n;
}

export interface StudentPractice {
  studentId: string;
  studentName: string;
  days: DayProgress[];
  today: DayProgress;
  /** Days with some practice in `days`. */
  activeDays: number;
  streak: number;
  /** One-off tasks still to do, and how many are past due. */
  openTasks: number;
  overdue: number;
  /** Anything assigned at all (otherwise there's nothing to show). */
  hasTasks: boolean;
}

/** Each student's practice over the last `n` days, for a tutor (or a family with several students). */
export function practiceByStudent(items: PracticeItem[], n = 7, today: string = easternDate(0)): Map<string, StudentPractice> {
  const days = lastDays(n, today);
  const byStudent = new Map<string, PracticeItem[]>();
  for (const it of items) if (it.kind === "task") byStudent.set(it.student_id, [...(byStudent.get(it.student_id) ?? []), it]);
  const out = new Map<string, StudentPractice>();
  for (const [studentId, list] of byStudent) {
    const progress = practiceDays(list, days);
    const open = list.filter((x) => x.repeat === "once" && !x.done_at);
    out.set(studentId, {
      studentId,
      studentName: list[0].student_name,
      days: progress,
      today: progress[progress.length - 1],
      activeDays: progress.filter(practised).length,
      streak: practiceStreak(list, today),
      openTasks: open.length,
      overdue: open.filter((x) => x.due_on && x.due_on < today).length,
      hasTasks: list.length > 0,
    });
  }
  return out;
}

/** "Tue, Oct 14: 2 of 3 daily tasks, 1 task finished" — the words behind one square of the strip. */
export function describeDay(p: DayProgress, today: string = easternDate(0)): string {
  const when = p.day === today ? "Today" : formatDue(p.day);
  const parts: string[] = [];
  if (p.daily > 0) parts.push(`${p.ticked} of ${p.daily} daily ${p.daily === 1 ? "task" : "tasks"} practised`);
  if (p.finished > 0) parts.push(`${p.finished} ${p.finished === 1 ? "task" : "tasks"} finished`);
  return `${when}: ${parts.length ? parts.join(", ") : "nothing to practise"}`;
}

export type MatrixCell = "ticked" | "missed" | "finished" | "off" | "waiting";

/** One student's tasks, task by day: daily tasks every day they ran, one-off tasks on the day they were finished. */
export function practiceMatrix(items: PracticeItem[], days: string[], today: string = easternDate(0)) {
  const first = days[0];
  return items
    .filter((it) => it.kind === "task" && (it.repeat === "daily" ? (!it.due_on || it.due_on >= first) : (finishedOn(it) ?? "") >= first))
    .sort((a, b) => (a.repeat === b.repeat ? a.created_at.localeCompare(b.created_at) : a.repeat === "daily" ? -1 : 1))
    .map((it) => ({
      id: it.id,
      body: it.body,
      cells: days.map((day): MatrixCell => {
        if (it.repeat === "once") return finishedOn(it) === day ? "finished" : "off";
        if (!runsOn(it, day)) return "off";
        if (tickedOn(it, day)) return "ticked";
        return day >= today ? "waiting" : "missed";
      }),
    }));
}
