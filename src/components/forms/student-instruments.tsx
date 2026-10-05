"use client";
import { X } from "lucide-react";
import { LEVEL_INFO, LEVELS, type Level } from "@/lib/constants";
import { InstrumentPicker, type SubjectOption } from "./instrument-picker";
import { ChoiceCards } from "./choice-cards";
import { Checkbox } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface StudentInstrumentItem {
  subjectId: string | null;
  name: string;
  family: string;
  level: Level | null;
  yearsPlaying: number;
  hasInstrument: boolean;
  inSchoolProgram: boolean;
}

const YEARS = [
  { value: 0, label: "Under 1 year" },
  { value: 1, label: "1 year" },
  { value: 2, label: "2 years" },
  { value: 3, label: "3+ years" },
];

export function StudentInstrumentsEditor({
  subjects,
  items,
  onChange,
  studentName,
}: {
  subjects: SubjectOption[];
  items: StudentInstrumentItem[];
  onChange: (items: StudentInstrumentItem[]) => void;
  studentName: string;
}) {
  const update = (i: number, patch: Partial<StudentInstrumentItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  return (
    <div className="space-y-4">
      {items.map((it, i) => (
        <div key={`${it.subjectId ?? it.name}-${i}`} className="animate-rise rounded-2xl border border-line bg-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Instrument {i + 1}</p>
              <h3 className="display mt-1 text-3xl">{it.name}</h3>
              {!it.subjectId && <p className="mt-1 text-xs text-muted">New instrument — we’ll add it to the list.</p>}
            </div>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="rounded-full p-2 text-muted hover:bg-paper-2 hover:text-ink"
              aria-label={`Remove ${it.name}`}
            >
              <X className="size-4" />
            </button>
          </div>

          <p className="mt-5 text-sm font-medium">How would you describe {studentName || "your student"}’s level?</p>
          <div className="mt-2">
            <ChoiceCards<Level>
              name={`level-${i}`}
              value={it.level}
              onChange={(v) => update(i, { level: v })}
              choices={LEVELS.map((l) => ({ value: l, label: LEVEL_INFO[l].label, description: LEVEL_INFO[l].student }))}
            />
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium">How long have they played?</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {YEARS.map((y) => (
                  <button
                    key={y.value}
                    type="button"
                    onClick={() => update(i, { yearsPlaying: y.value })}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition",
                      it.yearsPlaying === y.value ? "border-ink bg-ink text-cream" : "border-line-2 bg-card hover:border-ink/30",
                    )}
                  >
                    {y.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 sm:pt-6">
              <Checkbox
                checked={it.hasInstrument}
                onChange={(e) => update(i, { hasInstrument: e.target.checked })}
                label="They have this instrument at home to practice on"
                description="Owned, rented, or borrowed from school — lessons need one."
              />
              <Checkbox
                checked={it.inSchoolProgram}
                onChange={(e) => update(i, { inSchoolProgram: e.target.checked })}
                label="They play it in school band or orchestra"
              />
            </div>
          </div>
        </div>
      ))}

      {items.length < 3 && (
        <div>
          {items.length > 0 && <p className="mb-2 text-sm font-medium text-ink-2">Add another instrument (optional)</p>}
          <InstrumentPicker
            subjects={subjects}
            exclude={items.map((i) => i.subjectId).filter(Boolean) as string[]}
            onPick={(p) =>
              onChange([...items, { ...p, level: null, yearsPlaying: 0, hasInstrument: false, inSchoolProgram: true }])
            }
          />
        </div>
      )}
    </div>
  );
}

export function studentInstrumentsError(items: StudentInstrumentItem[]): string | null {
  if (!items.length) return "Add at least one instrument.";
  for (const it of items) {
    if (!it.level) return `Choose a level for ${it.name}.`;
    if (!it.hasInstrument) return `Lessons need an instrument at home — please confirm for ${it.name}, or remove it.`;
  }
  return null;
}
