import { cn } from "@/lib/cn";
import { dayState, describeDay, easternDate, type DayProgress, type DayState } from "@/lib/practice";

const TONE: Record<DayState, string> = {
  full: "border-pine-700 bg-pine-700",
  partial: "border-pine-500 bg-pine-200",
  finished: "border-brass-600 bg-glow",
  missed: "border-clay-100 bg-clay-50",
  waiting: "border-dashed border-ink/30 bg-card",
  none: "border-transparent bg-paper-2",
};

const LEGEND: { state: DayState; label: string }[] = [
  { state: "full", label: "All practised" },
  { state: "partial", label: "Some" },
  { state: "finished", label: "Task finished" },
  { state: "missed", label: "Missed" },
];

const weekday = (day: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "narrow" }).format(new Date(`${day}T12:00:00Z`));

/**
 * Practice day by day: one square per day, oldest first, today outlined.
 * Every square has its words for screen readers ("Tue, Oct 14: 2 of 3 daily
 * tasks practised"), so the colours are never the only signal.
 */
export function PracticeWeek({
  days,
  today = easternDate(0),
  size = "md",
  labels = size === "md",
  label = "Practice by day",
  className,
}: {
  days: DayProgress[];
  today?: string;
  size?: "sm" | "md";
  labels?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <ol aria-label={label} className={cn("flex", size === "sm" ? "gap-1" : "gap-1.5", className)}>
      {days.map((d) => {
        const words = describeDay(d, today);
        return (
          <li key={d.day} className={cn(size === "md" && "min-w-0 flex-1")} title={words}>
            <span className="sr-only">{words}</span>
            <span
              aria-hidden
              className={cn(
                "block border transition-colors duration-300",
                size === "sm" ? "size-3 rounded-[4px]" : "h-7 w-full rounded-lg",
                TONE[dayState(d, today)],
                d.day === today && "ring-2 ring-ink/45 ring-offset-1 ring-offset-card",
              )}
            />
            {labels && (
              <span aria-hidden className={cn("mt-1 block text-center font-mono text-[10px] uppercase", d.day === today ? "font-semibold text-ink" : "text-faint")}>
                {weekday(d.day)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** What the colours mean, once per screen. */
export function PracticeLegend({ className }: { className?: string }) {
  return (
    <ul aria-hidden className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted", className)}>
      {LEGEND.map((l) => (
        <li key={l.state} className="flex items-center gap-1.5">
          <span className={cn("block size-2.5 rounded-[3px] border", TONE[l.state])} />
          {l.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Task by day, for a tutor looking at one student: a row per daily task (and
 * per one-off task finished in the window), a column per day.
 */
export function PracticeMatrix({
  rows,
  days,
  today = easternDate(0),
}: {
  rows: { id: string; body: string; cells: ("ticked" | "missed" | "finished" | "off" | "waiting")[] }[];
  days: string[];
  today?: string;
}) {
  const CELL = {
    ticked: "border-pine-700 bg-pine-700",
    finished: "border-brass-600 bg-glow",
    missed: "border-clay-100 bg-clay-50",
    waiting: "border-dashed border-ink/30 bg-card",
    off: "border-transparent bg-transparent",
  } as const;
  const WORD = { ticked: "practised", finished: "finished", missed: "not practised", waiting: "not yet", off: "not set" } as const;
  return (
    <div className="space-y-3">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} aria-hidden>
        {days.map((d) => (
          <span key={d} className={cn("text-center font-mono text-[10px] uppercase", d === today ? "font-semibold text-ink" : "text-faint")}>
            {weekday(d)}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.id}>
          <p className="mb-1 truncate text-[13px] text-ink-2">{r.body}</p>
          <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} aria-label={r.body}>
            {r.cells.map((c, i) => (
              <li key={days[i]} title={`${formatDay(days[i], today)}: ${WORD[c]}`}>
                <span className="sr-only">{`${formatDay(days[i], today)}: ${WORD[c]}`}</span>
                <span aria-hidden className={cn("block h-4 rounded-[5px] border", CELL[c], days[i] === today && c !== "off" && "ring-1 ring-ink/45 ring-offset-1 ring-offset-card")} />
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

const formatDay = (day: string, today: string) =>
  day === today ? "Today" : new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
