import { BLOCKS, DAYS } from "./constants";
import { easternDateOffset, easternParts, easternToUtc } from "./time";

export interface BusyInterval {
  start: string;
  end: string;
}

export interface OpenSlot {
  /** ISO start instant. */
  start: string;
  /** Eastern calendar date, "2026-10-02". */
  date: string;
  /** Eastern wall-clock time, "17:30". */
  time: string;
  /** Also inside one of the student's own free blocks. */
  both: boolean;
}

/**
 * Times a family can request with a tutor: inside the tutor's weekly free
 * blocks, on the half hour, not overlapping anything the tutor (or the
 * student) already has booked or requested, and valid by the program's rules
 * (2+ hours ahead, 8 AM–10 PM Eastern). Times that also fit the student's own
 * free blocks are flagged so they can be shown first.
 *
 * Pure: pass `now` for testing. The database re-checks everything on request.
 */
export function openSlots(opts: {
  tutorAvailability: string[];
  studentAvailability: string[];
  busy: BusyInterval[];
  minutes: number;
  now?: Date;
  days?: number;
  stepMinutes?: number;
}): OpenSlot[] {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 14;
  const step = opts.stepMinutes ?? 30;
  const tutor = new Set(opts.tutorAvailability);
  const student = new Set(opts.studentAvailability);
  const busy = opts.busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);
  const out: OpenSlot[] = [];

  const earliest = now.getTime() + 2 * 3600_000;
  const latest = now.getTime() + 90 * 86400_000;
  for (let d = 0; d < days; d++) {
    const date = easternDateOffset(d, now);
    const noon = easternToUtc(date, "12:00");
    if (!noon) continue;
    const dayKey = DAYS[(easternParts(noon).weekday + 6) % 7].key; // weekday 0 = Sunday
    // Blocks run 9 AM–9 PM and DST changes at 2 AM, so one offset per day is exact.
    const [y, mo, day] = date.split("-").map(Number);
    const offsetMs = Date.UTC(y, mo - 1, day, 12) - noon.getTime();
    for (const block of BLOCKS) {
      const slotKey = `${dayKey}_${block.key}`;
      if (!tutor.has(slotKey)) continue;
      for (let m = block.start; m + opts.minutes <= block.end; m += step) {
        // The program's window (mirrors validate_slot): 8 AM–10 PM, same day.
        if (m < 8 * 60 || m + opts.minutes > 22 * 60) continue;
        const s = Date.UTC(y, mo - 1, day, Math.floor(m / 60), m % 60) - offsetMs;
        const e = s + opts.minutes * 60000;
        if (s < earliest || s > latest) continue;
        if (busy.some(([bs, be]) => s < be && e > bs)) continue;
        const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        out.push({ start: new Date(s).toISOString(), date, time, both: student.has(slotKey) });
      }
    }
  }
  return out;
}

/** The start of each week in a weekly series, keeping the Eastern wall-clock time (mirrors private.weekly_start). */
export function weeklyStarts(date: string, time: string, weeks: number): Date[] {
  const out: Date[] = [];
  const [y, m, d] = date.split("-").map(Number);
  for (let k = 0; k < weeks; k++) {
    const day = new Date(Date.UTC(y, m - 1, d + 7 * k));
    const iso = day.toISOString().slice(0, 10);
    const start = easternToUtc(iso, time);
    if (start) out.push(start);
  }
  return out;
}

/** The time to suggest first: the earliest that also fits the student's own free times, else the earliest. */
export function bestSlot(slots: OpenSlot[]): OpenSlot | null {
  return slots.find((s) => s.both) ?? slots[0] ?? null;
}

export type DayPart = "Morning" | "Afternoon" | "Evening";
export const DAY_PARTS: DayPart[] = ["Morning", "Afternoon", "Evening"];

/** Which part of the day an Eastern wall-clock time ("17:30") falls in. */
export function dayPart(time: string): DayPart {
  const h = Number(time.slice(0, 2));
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

/** The lesson length to offer by default: the student's preference when the tutor offers it, else the tutor's first. */
export function defaultMinutes(tutorMinutes: number[], preferred: number | undefined): number {
  return preferred && tutorMinutes.includes(preferred) ? preferred : (tutorMinutes[0] ?? 45);
}

/** Formats an Eastern calendar date ("2026-10-02") without shifting it across time zones. */
export function calendarLabel(date: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(`${date}T12:00:00Z`));
}

/** "Today", "Tomorrow", or "Thu, Oct 8" for an Eastern calendar date. */
export function friendlyDay(date: string, now: Date = new Date()): string {
  if (date === easternDateOffset(0, now)) return "Today";
  if (date === easternDateOffset(1, now)) return "Tomorrow";
  return calendarLabel(date, { weekday: "short", month: "short", day: "numeric" });
}

/** 0 = Monday … 6 = Sunday, matching DAYS. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}
