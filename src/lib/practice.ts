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
  /** Not done: overdue first, then by due date, then newest. */
  open: PracticeItem[];
  /** Done: most recently ticked first. */
  done: PracticeItem[];
  latestAt: string;
}

/** One group per tutor and student, the busiest (most recent) first. */
export function groupBoard(items: PracticeItem[]): BoardGroup[] {
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
      };
      groups.set(key, g);
    }
    if (it.created_at > g.latestAt) g.latestAt = it.created_at;
    if (it.kind === "note") g.notes.push(it);
    else if (it.done_at) g.done.push(it);
    else g.open.push(it);
  }
  for (const g of groups.values()) {
    g.notes.sort((a, b) => b.created_at.localeCompare(a.created_at));
    g.open.sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || b.created_at.localeCompare(a.created_at));
    g.done.sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  }
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}
