import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  const pct = Math.round(((current + 1) / steps.length) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          Step {current + 1} of {steps.length} · <span className="font-medium text-ink">{steps[current]}</span>
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-3">
        <div className="h-full rounded-full bg-pine-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-4 hidden gap-2 md:flex">
        {steps.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-1.5 text-xs", i <= current ? "text-ink-2" : "text-faint")}>
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
                i < current ? "bg-pine-600 text-white" : i === current ? "bg-ink text-white" : "bg-paper-3 text-muted",
              )}
            >
              {i < current ? <Check className="size-2.5" /> : i + 1}
            </span>
            {s}
            {i < steps.length - 1 && <span className="ml-1 h-px w-4 bg-line-2" />}
          </li>
        ))}
      </ol>
    </div>
  );
}
