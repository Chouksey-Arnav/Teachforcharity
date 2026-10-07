import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** `progress` (0–1) overrides the bar when one step spans several screens, as in the parent's sign-up journey. */
export function Stepper({ steps, current, progress }: { steps: string[]; current: number; progress?: number }) {
  const pct = Math.round((progress ?? (current + 1) / steps.length) * 100);
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        <span>
          Step {current + 1} of {steps.length} · <span className="text-pine-700">{steps[current]}</span>
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
        <div className="h-full rounded-full bg-pine-700 transition-[width] duration-700 ease-[cubic-bezier(0.2,0.7,0.3,1)]" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-4 hidden flex-wrap gap-x-2 gap-y-2 md:flex">
        {steps.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-1.5 whitespace-nowrap text-[12.5px]", i === current ? "font-semibold text-ink" : i < current ? "text-ink-2" : "text-faint")}>
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full font-mono text-[10px]",
                i < current ? "bg-pine-700 text-white" : i === current ? "bg-ink text-cream" : "border border-ink/15 bg-white text-muted",
              )}
            >
              {i < current ? <Check className="size-2.5" /> : i + 1}
            </span>
            {s}
            {i < steps.length - 1 && <span className="ml-1 h-px w-3 bg-ink/15" />}
          </li>
        ))}
      </ol>
    </div>
  );
}
