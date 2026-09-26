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
              "relative flex cursor-pointer gap-3 rounded-xl border bg-card transition",
              size === "sm" ? "px-3.5 py-2.5" : "p-4",
              selected ? "border-pine-700 bg-pine-50/40 ring-4 ring-pine-600/10" : "border-line hover:border-line-2",
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
                selected ? "border-pine-700 bg-pine-700" : "border-line-2 bg-card",
              )}
            >
              {selected && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{c.label}</span>
              {c.description && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{c.description}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
