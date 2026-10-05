import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-ink/10 bg-card shadow-card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-ink/[0.08] px-5 py-4 sm:px-6", className)}>
      <div className="min-w-0">
        <h2 className="text-[15.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, description, className }: { eyebrow?: string; title: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {eyebrow && <p className="lm-eyebrow mb-4">{eyebrow}</p>}
      <h2 className="lm-h2 text-ink">{title}</h2>
      {description && <p className="lm-sub mt-5 max-w-2xl">{description}</p>}
    </div>
  );
}
