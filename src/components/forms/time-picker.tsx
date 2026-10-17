"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { easternDateOffset, formatTime } from "@/lib/time";
import { DAY_PARTS, calendarLabel, dayPart, type OpenSlot } from "@/lib/slots";
import { cn } from "@/lib/cn";

/**
 * The one way to pick a lesson time: a week of days (a dot means there are open
 * times), then the open start times on that day. Used to book, to suggest
 * another time, to move a lesson and for a tutor's proposals, so everyone
 * learns it once. Starred times also fit the student's usual free times.
 */
export function TimePicker({
  slots,
  value,
  onChange,
  fitsLabel,
  days = 14,
}: {
  slots: OpenSlot[];
  value: OpenSlot | null;
  onChange: (slot: OpenSlot) => void;
  /** "Leo’s" / "your": shown as "Fits Leo’s usual free times". Leave out to hide stars. */
  fitsLabel?: string;
  days?: number;
}) {
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => easternDateOffset(i)), [days]);
  const byDay = useMemo(() => {
    const m = new Map<string, OpenSlot[]>();
    for (const s of slots) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [slots]);
  const suggested = slots.find((s) => s.both) ?? slots[0] ?? null;
  const [day, setDay] = useState<string | null>(value?.date ?? null);
  const activeDay = day && byDay.has(day) ? day : (value?.date ?? suggested?.date ?? null);
  const weeks = Math.ceil(days / 7);
  const [page, setPage] = useState(() => Math.max(0, Math.floor(dates.indexOf(activeDay ?? dates[0]) / 7)));
  const daySlots = (activeDay && byDay.get(activeDay)) || [];
  const shown = dates.slice(page * 7, page * 7 + 7);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-2">
          {calendarLabel(shown[0], { month: "short", day: "numeric" })} – {calendarLabel(shown[shown.length - 1], { month: "short", day: "numeric" })}
        </p>
        <div className="flex gap-1">
          <button type="button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} aria-label="Earlier week" className="rounded-full p-1.5 text-ink-2 hover:bg-paper-2 disabled:opacity-30">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setPage(Math.min(weeks - 1, page + 1))} disabled={page >= weeks - 1} aria-label="Later week" className="rounded-full p-1.5 text-ink-2 hover:bg-paper-2 disabled:opacity-30">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Day">
        {shown.map((d) => {
          const list = byDay.get(d) ?? [];
          const on = d === activeDay;
          const fits = list.some((s) => s.both);
          return (
            <button
              key={d}
              type="button"
              disabled={!list.length}
              aria-pressed={on}
              onClick={() => setDay(d)}
              className={cn(
                "relative flex min-w-0 flex-col items-center rounded-xl border py-1.5 transition",
                on ? "border-ink bg-ink text-cream" : list.length ? "border-line bg-card hover:border-pine-500" : "border-transparent text-faint",
              )}
            >
              <span className={cn("text-[10px] font-semibold uppercase", on ? "text-white/80" : "text-muted")}>{calendarLabel(d, { weekday: "short" })}</span>
              <span className="text-[15px] font-semibold leading-tight">{calendarLabel(d, { day: "numeric" })}</span>
              <span className="sr-only">
                {" "}
                {calendarLabel(d, { month: "long" })}, {list.length ? `${list.length} open time${list.length === 1 ? "" : "s"}` : "no open times"}
              </span>
              <span className={cn("mt-0.5 size-1.5 rounded-full", !list.length ? "bg-transparent" : fits && fitsLabel ? (on ? "bg-brass-300" : "bg-pine-600") : on ? "bg-white/60" : "bg-ink-2/40")} aria-hidden />
            </button>
          );
        })}
      </div>

      {activeDay ? (
        <div className="mt-4 space-y-3" role="radiogroup" aria-label={`Start times on ${calendarLabel(activeDay, { weekday: "long", month: "long", day: "numeric" })}`}>
          <p className="text-[13px] font-semibold">{calendarLabel(activeDay, { weekday: "long", month: "long", day: "numeric" })}</p>
          {DAY_PARTS.map((part) => {
            const list = daySlots.filter((s) => dayPart(s.time) === part);
            if (!list.length) return null;
            return (
              <div key={part}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">{part}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {list.map((s) => {
                    const on = value?.start === s.start;
                    const star = s.both && Boolean(fitsLabel);
                    return (
                      <button
                        key={s.start}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`${formatTime(s.start)}${star ? `, fits ${fitsLabel} free times` : ""}`}
                        onClick={() => onChange(s)}
                        className={cn(
                          "inline-flex h-10 items-center justify-center gap-1 rounded-lg border text-[13px] font-medium tabular-nums transition",
                          on
                            ? "border-ink bg-ink text-cream shadow-[0_0_0_3px_rgb(42_106_87/0.15)]"
                            : star
                              ? "border-pine-200 bg-pine-50 text-pine-800 hover:border-pine-600"
                              : "border-line bg-card text-ink-2 hover:border-ink/30",
                        )}
                      >
                        {star && <Star className={cn("size-3", on ? "fill-brass-300 text-brass-300" : "fill-current")} aria-hidden />}
                        {formatTime(s.start)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-paper-2/60 px-4 py-3 text-[13px] text-muted">No open times these days. Try the arrows for another week.</p>
      )}
      {fitsLabel && slots.some((s) => s.both) && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Star className="size-3 fill-pine-600 text-pine-600" aria-hidden /> Fits {fitsLabel} usual free times
        </p>
      )}
    </div>
  );
}
