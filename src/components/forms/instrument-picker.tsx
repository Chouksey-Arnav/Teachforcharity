"use client";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { INSTRUMENT_FAMILIES } from "@/lib/constants";
import { cn } from "@/lib/cn";

export interface SubjectOption {
  id: string;
  slug: string;
  name: string;
  family: string;
  aliases: string[];
  is_custom: boolean;
}

export type PickedInstrument = { subjectId: string | null; name: string; family: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Pick a known instrument or type a new one. Already-chosen instruments are hidden. */
export function InstrumentPicker({
  subjects,
  exclude,
  onPick,
}: {
  subjects: SubjectOption[];
  exclude: string[];
  onPick: (p: PickedInstrument) => void;
}) {
  const [q, setQ] = useState("");
  const [family, setFamily] = useState<string>("all");
  const query = norm(q);

  const available = useMemo(() => subjects.filter((s) => !exclude.includes(s.id) && !s.is_custom), [subjects, exclude]);
  const matches = useMemo(() => {
    if (!query) return available.filter((s) => family === "all" || s.family === family);
    return available.filter(
      (s) => norm(s.name).includes(query) || s.aliases.some((a) => norm(a).includes(query)) || s.slug.includes(query.replace(/ /g, "-")),
    );
  }, [available, query, family]);
  const exact = matches.some((s) => norm(s.name) === query || s.aliases.some((a) => norm(a) === query));

  return (
    <div className="rounded-2xl border border-line bg-paper/60 p-3 sm:p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search or type an instrument (e.g. clarinet, euphonium, viola)"
          className="h-11 w-full rounded-xl border border-line-2 bg-card pl-10 pr-3 text-[15px] placeholder:text-faint focus:border-ink/40 focus:outline-none focus:ring-4 focus:ring-glow/50"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) {
                onPick({ subjectId: matches[0].id, name: matches[0].name, family: matches[0].family });
                setQ("");
              } else if (query.length >= 2) {
                onPick({ subjectId: null, name: q.trim(), family: "other" });
                setQ("");
              }
            }
          }}
        />
      </div>
      {!query && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {[{ key: "all", label: "All" }, ...INSTRUMENT_FAMILIES.filter((f) => f.key !== "other")].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFamily(f.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition",
                family === f.key ? "bg-ink text-white" : "text-muted hover:bg-paper-2",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
        {matches.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onPick({ subjectId: s.id, name: s.name, family: s.family });
              setQ("");
            }}
            className="rounded-full border border-line-2 bg-card px-3.5 py-1.5 text-sm text-ink-2 transition hover:border-pine-600 hover:text-pine-800"
          >
            {s.name}
          </button>
        ))}
        {query.length >= 2 && !exact && (
          <button
            type="button"
            onClick={() => {
              onPick({ subjectId: null, name: q.trim(), family: "other" });
              setQ("");
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-pine-600 bg-pine-50 px-3.5 py-1.5 text-sm font-medium text-pine-800"
          >
            <Plus className="size-3.5" /> Add “{q.trim()}”
          </button>
        )}
        {matches.length === 0 && query.length < 2 && <p className="text-sm text-muted">Everything in this group is already added.</p>}
      </div>
    </div>
  );
}
