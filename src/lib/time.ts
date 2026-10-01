import { SITE } from "./site";

const TZ = SITE.timezone;

/** Offset (minutes) of `timeZone` from UTC at the given instant. Eastern is -240 (EDT) or -300 (EST). */
export function tzOffsetMinutes(instant: Date, timeZone: string = TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Converts a wall-clock date + time in Eastern (e.g. "2026-10-02", "19:00") to a UTC Date.
 * Handles daylight-saving transitions. Returns null for malformed input or
 * for times that don't exist (the spring-forward gap).
 */
export function easternToUtc(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall - tzOffsetMinutes(new Date(wall)) * 60000;
  guess = wall - tzOffsetMinutes(new Date(guess)) * 60000;
  const result = new Date(guess);
  const back = easternParts(result);
  if (back.date !== date || back.time !== time) return null;
  return result;
}

/** Eastern wall-clock parts of an instant. */
export function easternParts(instant: Date): { date: string; time: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    weekday,
    minutes: hour * 60 + minute,
  };
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export function formatWhen(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return fmt({ weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}
export function formatDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return fmt({ weekday: "long", month: "long", day: "numeric" }).format(d);
}
export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return fmt({ month: "short", day: "numeric", year: "numeric" }).format(d);
}
export function formatTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return fmt({ hour: "numeric", minute: "2-digit" }).format(d);
}
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(iso);
}

/** "2026-10-02" for today in Eastern, offset by `days`. */
export function easternDateOffset(days: number, from: Date = new Date()): string {
  return easternParts(new Date(from.getTime() + days * 86400000)).date;
}

/** Quarter-hour times from 8:00 AM to 9:30 PM for the time picker. */
export function timeOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let m = 8 * 60; m <= 21 * 60 + 30; m += 15) {
    const h = Math.floor(m / 60);
    const mi = m % 60;
    const value = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    const label = `${((h + 11) % 12) + 1}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    out.push({ value, label });
  }
  return out;
}

/** Mirrors private.validate_slot so users get instant feedback. The database is the authority. */
export function validateSlot(start: Date | null, minutes: number, now: Date = new Date()): string | null {
  if (!start) return "Please pick a valid date and time.";
  if (![30, 45, 60].includes(minutes)) return "Lessons can be 30, 45, or 60 minutes long.";
  if (start.getTime() < now.getTime() + 2 * 3600_000) return "Please pick a time at least 2 hours from now.";
  if (start.getTime() > now.getTime() + 90 * 86400_000) return "Please pick a time within the next 90 days.";
  const s = easternParts(start);
  const e = easternParts(new Date(start.getTime() + minutes * 60000));
  if (s.minutes % 15 !== 0) return "Lessons start on the quarter hour.";
  if (s.minutes < 8 * 60 || e.date !== s.date || e.minutes > 22 * 60)
    return "Lessons must take place between 8:00 AM and 10:00 PM Eastern.";
  return null;
}

/** "in 25 minutes", "in 3 hours", "tomorrow", "in 6 days" — counted in Eastern calendar days past the first day. */
export function startsIn(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return "now";
  if (ms < 3600_000) return `in ${Math.max(1, Math.round(ms / 60000))} minutes`;
  const days = Math.round((Date.parse(easternParts(new Date(iso)).date) - Date.parse(easternParts(now).date)) / 86400000);
  if (days === 0) return `in ${Math.round(ms / 3600_000)} hour${Math.round(ms / 3600_000) === 1 ? "" : "s"}`;
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
