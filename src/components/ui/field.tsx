import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-xl border border-ink/14 bg-white/85 px-4 text-[15px] text-ink placeholder:text-faint shadow-[inset_0_1px_1px_rgb(22_32_28/0.04)] transition-[border-color,box-shadow,background-color] hover:border-ink/25 focus:border-ink/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-glow/50 disabled:bg-paper-2 disabled:text-muted aria-[invalid=true]:border-clay-500 aria-[invalid=true]:ring-clay-500/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-12 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-[14px] font-semibold text-ink", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional && <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">Optional</span>}
      </div>
      {children}
      {error ? (
        <p className="text-[13px] text-clay-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] leading-snug text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, label, description, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("group flex cursor-pointer items-start gap-3", className)}>
      <span className="relative mt-0.5 inline-flex size-[18px] shrink-0">
        <input
          type="checkbox"
          className="peer size-[18px] cursor-pointer appearance-none rounded-[5px] border border-line-2 bg-card transition checked:border-ink checked:bg-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-glow/60 aria-[invalid=true]:border-clay-500"
          {...props}
        />
        <svg className="pointer-events-none absolute inset-0 m-auto size-3 text-white opacity-0 transition peer-checked:opacity-100" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-sm leading-snug text-ink-2">
        {label}
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
}
