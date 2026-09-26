"use client";
import { useRef } from "react";
import { BLOCKS, DAYS } from "@/lib/constants";
import { cn } from "@/lib/cn";

const PRESETS: { label: string; slots: string[] }[] = [
  { label: "Weekday evenings", slots: ["mon", "tue", "wed", "thu", "fri"].flatMap((d) => [`${d}_early_evening`, `${d}_evening`]) },
  { label: "After school", slots: ["mon", "tue", "wed", "thu", "fri"].map((d) => `${d}_afternoon`) },
  { label: "Weekends", slots: ["sat", "sun"].flatMap((d) => BLOCKS.map((b) => `${d}_${b.key}`)) },
];

/**
 * Weekly availability grid. Click or drag across cells to toggle.
 * `highlight` marks cells the other person is also free (used on tutor profiles).
 */
export function SlotGrid({
  value,
  onChange,
  readOnly,
  highlight,
  compact,
}: {
  value: string[];
  onChange?: (v: string[]) => void;
  readOnly?: boolean;
  highlight?: string[];
  compact?: boolean;
}) {
  const dragging = useRef<null | boolean>(null);
  const set = new Set(value);
  const hl = new Set(highlight ?? []);

  const apply = (slot: string, on: boolean) => {
    if (!onChange) return;
    const next = new Set(set);
    if (on) next.add(slot);
    else next.delete(slot);
    onChange([...next]);
  };

  return (
    <div className={cn("select-none", !readOnly && "touch-none")} onPointerUp={() => (dragging.current = null)} onPointerLeave={() => (dragging.current = null)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-separate" style={{ borderSpacing: compact ? 3 : 4 }}>
          <thead>
            <tr>
              <th className="w-[74px]" />
              {DAYS.map((d) => (
                <th key={d.key} scope="col" className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BLOCKS.map((b) => (
              <tr key={b.key}>
                <th scope="row" className="pr-1 text-left align-middle">
                  <span className="block text-[12px] font-medium leading-tight text-ink-2">{b.label}</span>
                  <span className="block text-[10.5px] text-faint">{b.range}</span>
                </th>
                {DAYS.map((d) => {
                  const slot = `${d.key}_${b.key}`;
                  const on = set.has(slot);
                  const both = on && hl.has(slot);
                  const label = `${d.long} ${b.label.toLowerCase()} (${b.range})`;
                  return (
                    <td key={slot} className="p-0">
                      {readOnly ? (
                        <div
                          title={label}
                          className={cn(
                            "rounded-md",
                            compact ? "h-5" : "h-8",
                            both ? "bg-brass-500" : on ? "bg-pine-600" : hl.has(slot) ? "bg-brass-100" : "bg-paper-2",
                          )}
                        />
                      ) : (
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={label}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            dragging.current = !on;
                            apply(slot, !on);
                          }}
                          onPointerEnter={() => {
                            if (dragging.current !== null && set.has(slot) !== dragging.current) apply(slot, dragging.current);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              apply(slot, !on);
                            }
                          }}
                          className={cn(
                            "block h-10 w-full rounded-lg border transition-colors",
                            on ? "border-pine-700 bg-pine-600 hover:bg-pine-700" : "border-line bg-card hover:border-pine-500 hover:bg-pine-50",
                          )}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && onChange && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Quick fill:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange([...new Set([...value, ...p.slots])])}
              className="rounded-full border border-line-2 bg-card px-3 py-1 text-xs text-ink-2 hover:border-ink/30"
            >
              + {p.label}
            </button>
          ))}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="rounded-full px-3 py-1 text-xs text-clay-700 hover:bg-clay-50">
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
