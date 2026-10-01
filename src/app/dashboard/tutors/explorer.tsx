"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, SearchX, Star, X } from "lucide-react";
import type { DirectoryTutor } from "@/lib/data";
import { TIER_ORDER, type MatchResult, type Tier } from "@/lib/matching";
import { DAYS } from "@/lib/constants";
import { weekdayIndex, type OpenSlot } from "@/lib/slots";
import { TutorCard } from "@/components/dashboard/tutor-card";
import { cn } from "@/lib/cn";

export interface ExplorerItem {
  tutor: DirectoryTutor;
  match: MatchResult;
  /** Requestable times; absent for tutors who are full. */
  slots?: OpenSlot[];
  href: string;
}

export type Sort = "fit" | "soonest";
export interface ExplorerFilters {
  q: string;
  days: string[];
  fits: boolean;
  sort: Sort;
}

const TIER_HEADINGS: Record<Tier, { title: string; body: string }> = {
  ideal: { title: "Great matches", body: "Plays your instrument, teaches your level, and has room for a new student." },
  stretch: { title: "Possible matches", body: "Plays your instrument and has room, but usually teaches a different level." },
  related: { title: "Related instruments", body: "No exact match yet — these tutors play a closely related instrument." },
  full: { title: "Currently full", body: "Play your instrument but aren’t taking new students right now." },
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Search, filter and sort the matched tutors instantly, keeping the choices in the URL so Back restores them. */
export function TutorExplorer({ items, initial, youLabel }: { items: ExplorerItem[]; initial: ExplorerFilters; youLabel: string }) {
  const [q, setQ] = useState(initial.q);
  const [days, setDays] = useState<string[]>(initial.days);
  const [fits, setFits] = useState(initial.fits);
  const [sort, setSort] = useState<Sort>(initial.sort);

  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (k: string, v: string | null) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    set("q", q.trim() || null);
    set("days", days.length ? days.join(",") : null);
    set("fits", fits ? "1" : null);
    set("sort", sort === "soonest" ? "soonest" : null);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [q, days, fits, sort]);

  const filtered = useMemo(() => {
    const term = norm(q.trim());
    const dayIdx = new Set(days.map((d) => DAYS.findIndex((x) => x.key === d)));
    const visibleSlots = (it: ExplorerItem) => (it.slots ?? []).filter((s) => (!dayIdx.size || dayIdx.has(weekdayIndex(s.date))) && (!fits || s.both));
    const out = items
      .filter((it) => {
        if (term) {
          const hay = norm([it.tutor.displayName, it.tutor.school ?? "", it.tutor.county ?? "", ...it.tutor.subjects.map((s) => s.name)].join(" "));
          if (!hay.includes(term)) return false;
        }
        // Day and schedule filters are about bookable times, so they only keep tutors with a matching one.
        if (dayIdx.size || fits) return visibleSlots(it).length > 0;
        return true;
      })
      .map((it) => ({ ...it, slots: it.slots && (dayIdx.size || fits) ? visibleSlots(it) : it.slots }));
    if (sort === "soonest") {
      const first = (it: ExplorerItem) => (it.slots?.[0] ? Date.parse(it.slots[0].start) : Infinity);
      out.sort((a, b) => first(a) - first(b) || TIER_ORDER[a.match.tier] - TIER_ORDER[b.match.tier] || b.match.score - a.match.score);
    }
    return out;
  }, [items, q, days, fits, sort]);

  const active = Boolean(q.trim()) || days.length > 0 || fits;
  const clear = () => {
    setQ("");
    setDays([]);
    setFits(false);
  };
  const toggleDay = (d: string) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  const groups =
    sort === "fit"
      ? (["ideal", "stretch", "related", "full"] as Tier[]).map((tier) => ({ tier, list: filtered.filter((i) => i.match.tier === tier) })).filter((g) => g.list.length)
      : [{ tier: null, list: filtered }];

  return (
    <div>
      <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-line bg-paper/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-2xl lg:border lg:bg-card lg:p-3 lg:backdrop-blur-none">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search tutors</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, school or instrument"
              className="h-10 w-full rounded-full border border-line-2 bg-card pl-10 pr-4 text-[14.5px] placeholder:text-faint focus:border-pine-600 focus:outline-none focus:ring-4 focus:ring-pine-600/10"
            />
          </label>
          <div className="inline-flex shrink-0 self-start rounded-full border border-line bg-paper-2/70 p-0.5 sm:self-auto" role="group" aria-label="Sort tutors">
            {(
              [
                ["fit", "Best fit"],
                ["soonest", "Soonest available"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={sort === k}
                onClick={() => setSort(k)}
                className={cn("h-9 rounded-full px-3.5 text-[13px] font-medium transition", sort === k ? "bg-card text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-1 mt-2.5 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter by open times">
          <button
            type="button"
            aria-pressed={fits}
            onClick={() => setFits(!fits)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition",
              fits ? "border-pine-700 bg-pine-700 text-white" : "border-line-2 bg-card text-ink-2 hover:border-ink/30",
            )}
          >
            <Star className={cn("size-3.5", fits && "fill-current")} aria-hidden /> Fits {youLabel} free times
          </button>
          <span className="mx-1 h-5 w-px shrink-0 bg-line-2" aria-hidden />
          {DAYS.map((d) => {
            const on = days.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                aria-pressed={on}
                aria-label={`Open on ${d.long}`}
                onClick={() => toggleDay(d.key)}
                className={cn(
                  "h-8 min-w-11 shrink-0 rounded-full border px-2.5 text-[13px] font-medium transition",
                  on ? "border-pine-700 bg-pine-50 text-pine-800" : "border-line-2 bg-card text-ink-2 hover:border-ink/30",
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3" aria-live="polite">
        <p className="text-sm text-muted">
          <strong className="font-semibold text-ink">{filtered.length}</strong> tutor{filtered.length === 1 ? "" : "s"}
          {active ? " match your filters" : sort === "soonest" ? ", soonest open time first" : ", best fit first"}
        </p>
        {active && (
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium text-pine-700 hover:bg-pine-50">
            <X className="size-3.5" aria-hidden /> Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-2 bg-paper/60 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-card text-pine-700 ring-1 ring-line">
            <SearchX className="size-5" aria-hidden />
          </span>
          <p className="display mt-4 text-2xl">No tutors match those filters</p>
          <p className="mt-2 max-w-sm text-sm text-muted">Try fewer days, or turn off “Fits {youLabel} free times” — you can always suggest a different time.</p>
          <button type="button" onClick={clear} className="mt-5 h-10 rounded-full bg-pine-700 px-5 text-sm font-medium text-white hover:bg-pine-800">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map(({ tier, list }) => (
            <section key={tier ?? "all"} aria-labelledby={tier ? `tier-${tier}` : undefined}>
              {tier && (
                <div className="mb-3.5">
                  <h2 id={`tier-${tier}`} className="text-lg font-semibold">
                    {TIER_HEADINGS[tier].title} <span className="font-normal text-muted">· {list.length}</span>
                  </h2>
                  <p className="text-sm text-muted">{TIER_HEADINGS[tier].body}</p>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((it) => (
                  <TutorCard key={it.tutor.tutorId} tutor={it.tutor} match={it.match} slots={it.slots} href={it.href} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
