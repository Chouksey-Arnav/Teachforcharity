"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Multi-select chips with an optional maximum. */
export function ChipGroup({
  options,
  value,
  onChange,
  max,
}: {
  options: { value: string; label: string; hint?: string; disabled?: boolean }[];
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const atMax = max !== undefined && value.length >= max;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        const disabled = o.disabled || (!on && atMax);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            title={o.hint}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] active:scale-[0.97]",
              on ? "border-ink bg-ink text-cream" : "border-ink/14 bg-white/75 text-ink-2 hover:border-ink/30 hover:bg-white",
              disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {on && <Check className="size-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
