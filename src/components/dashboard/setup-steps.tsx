import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SetupStep {
  label: string;
  /** What to do, shown only for the current step. */
  detail: string;
  done: boolean;
  /** Where the current step's button goes. Omit when the step is waiting on someone else. */
  href?: string;
  cta?: string;
}

/**
 * "Getting started" progress for new accounts, built from live data. Shows
 * every step and one clear next action; renders nothing once all are done.
 */
export function SetupSteps({ title, steps }: { title: string; steps: SetupStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const current = steps.findIndex((s) => !s.done);
  const next = steps[current];

  return (
    <section aria-labelledby="setup-title" className="mb-10 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 id="setup-title" className="text-[15px] font-semibold">
          {title}
        </h2>
        <span className="text-xs text-muted">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <ol className="grid sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ "--n": steps.length } as React.CSSProperties}>
        {steps.map((s, i) => {
          const isCurrent = i === current;
          return (
            <li
              key={s.label}
              aria-current={isCurrent ? "step" : undefined}
              className={cn("flex items-center gap-3 border-b border-line px-5 py-3 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0", isCurrent && "bg-brass-50/70")}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  s.done ? "bg-pine-700 text-white" : isCurrent ? "bg-brass-500 text-pine-950" : "bg-paper-2 text-muted ring-1 ring-line",
                )}
              >
                {s.done ? <Check className="size-4" strokeWidth={2.6} aria-label="Done" /> : i + 1}
              </span>
              <span className={cn("text-[13.5px] leading-snug", s.done ? "text-muted line-through decoration-line-2" : isCurrent ? "font-semibold text-ink" : "text-ink-2")}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-3 border-t border-line bg-paper/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">Next: </span>
          {next.detail}
        </p>
        {next.href && (
          <Link
            href={next.href}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-full bg-ink shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px px-4 text-[13px] font-semibold text-cream transition sm:self-auto"
          >
            {next.cta ?? "Continue"} <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
