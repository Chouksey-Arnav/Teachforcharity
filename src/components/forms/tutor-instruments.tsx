"use client";
import { X } from "lucide-react";
import { ENSEMBLES, LEVEL_INFO, LEVELS, type Level } from "@/lib/constants";
import { InstrumentPicker, type SubjectOption } from "./instrument-picker";
import { ChoiceCards } from "./choice-cards";
import { ChipGroup } from "./chip-group";
import { Select } from "@/components/ui/field";

export interface TutorInstrumentItem {
  subjectId: string | null;
  name: string;
  family: string;
  ownLevel: "intermediate" | "advanced" | null;
  yearsPlaying: number;
  topEnsemble: string;
  teachLevels: Level[];
}

export function TutorInstrumentsEditor({
  subjects,
  items,
  onChange,
}: {
  subjects: SubjectOption[];
  items: TutorInstrumentItem[];
  onChange: (items: TutorInstrumentItem[]) => void;
}) {
  const update = (i: number, patch: Partial<TutorInstrumentItem>) =>
    onChange(
      items.map((it, j) => {
        if (j !== i) return it;
        const next = { ...it, ...patch };
        if (next.ownLevel) next.teachLevels = next.teachLevels.filter((l) => LEVELS.indexOf(l) <= LEVELS.indexOf(next.ownLevel!));
        return next;
      }),
    );

  return (
    <div className="space-y-4">
      {items.map((it, i) => (
        <div key={`${it.subjectId ?? it.name}-${i}`} className="animate-rise rounded-2xl border border-line bg-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Instrument {i + 1}</p>
              <h3 className="display mt-1 text-3xl">{it.name}</h3>
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

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor={`years-${i}`}>
                Years playing
              </label>
              <div className="mt-2">
                <Select id={`years-${i}`} value={it.yearsPlaying || ""} onChange={(e) => update(i, { yearsPlaying: Number(e.target.value) })}>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {Array.from({ length: 12 }, (_, n) => n + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 12 ? "12+ years" : `${n} year${n > 1 ? "s" : ""}`}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor={`ens-${i}`}>
                Highest ensemble you’ve made
              </label>
              <div className="mt-2">
                <Select id={`ens-${i}`} value={it.topEnsemble} onChange={(e) => update(i, { topEnsemble: e.target.value })}>
                  {ENSEMBLES.map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <p className="mt-5 text-sm font-medium">Honestly, how strong a player are you on {it.name.toLowerCase()}?</p>
          <div className="mt-2">
            <ChoiceCards<"intermediate" | "advanced">
              name={`own-${i}`}
              value={it.ownLevel}
              onChange={(v) => update(i, { ownLevel: v })}
              choices={[
                { value: "intermediate", label: "Solid", description: "Comfortable with school music; still working on harder pieces." },
                { value: "advanced", label: "Strong", description: "Well beyond school level — auditions, solos, top ensembles." },
              ]}
            />
          </div>

          <p className="mt-5 text-sm font-medium">Which students would you like to teach?</p>
          <p className="text-[13px] text-muted">Pick the levels you’d genuinely enjoy teaching. Beginners need tutors too!</p>
          <div className="mt-2.5">
            <ChipGroup
              value={it.teachLevels}
              onChange={(v) => update(i, { teachLevels: v as Level[] })}
              options={LEVELS.map((l) => ({
                value: l,
                label: LEVEL_INFO[l].label,
                hint: LEVEL_INFO[l].student,
                disabled: !it.ownLevel || LEVELS.indexOf(l) > LEVELS.indexOf(it.ownLevel),
              }))}
            />
            {!it.ownLevel && <p className="mt-2 text-xs text-muted">Choose your own level first.</p>}
          </div>
        </div>
      ))}

      {items.length < 4 && (
        <div>
          {items.length > 0 && <p className="mb-2 text-sm font-medium text-ink-2">Play something else too? (optional)</p>}
          <InstrumentPicker
            subjects={subjects}
            exclude={items.map((i) => i.subjectId).filter(Boolean) as string[]}
            onPick={(p) => onChange([...items, { ...p, ownLevel: null, yearsPlaying: 0, topEnsemble: "school", teachLevels: [] }])}
          />
        </div>
      )}
    </div>
  );
}

export function tutorInstrumentsError(items: TutorInstrumentItem[]): string | null {
  if (!items.length) return "Add at least one instrument you play.";
  for (const it of items) {
    if (!it.yearsPlaying) return `How many years have you played ${it.name}?`;
    if (!it.ownLevel) return `How strong a player are you on ${it.name}?`;
    if (!it.teachLevels.length) return `Pick at least one level you'd teach on ${it.name}.`;
  }
  return null;
}
