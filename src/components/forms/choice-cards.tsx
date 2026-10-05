"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Choice<T extends string | number> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/** Single-select radio cards. */
export function ChoiceCards<T extends string | number>({
  name,
  value,
  onChange,
  choices,
  columns = 2,
  size = "md",
}: {
  name: string;
  value: T | null | undefined;
  onChange: (v: T) => void;
  choices: Choice<T>[];
  columns?: 1 | 2 | 3 | 4;
  size?: "sm" | "md";
}) {
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <div role="radiogroup" className={cn("grid gap-2.5", cols)}>
      {choices.map((c) => {
        const selected = value === c.value;
        return (
          <label
            key={String(c.value)}
            className={cn(
              "relative flex cursor-pointer gap-3 rounded-2xl border bg-white/85 transition-[border-color,box-shadow,background-color]",
              size === "sm" ? "px-3.5 py-2.5" : "p-4",
              selected ? "border-ink bg-white shadow-card ring-4 ring-glow/45" : "border-ink/12 hover:border-ink/25 hover:bg-white",
              c.disabled && "pointer-events-none opacity-45",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              checked={selected}
              disabled={c.disabled}
              onChange={() => onChange(c.value)}
            />
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border transition",
                selected ? "border-ink bg-ink" : "border-ink/20 bg-white",
              )}
            >
              {selected && <span className="size-1.5 rounded-full bg-glow" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-semibold text-ink">{c.label}</span>
              {c.description && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{c.description}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
