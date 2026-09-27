import { cn } from "@/lib/cn";

/** A placeholder block that pulses while a page loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-paper-3/70", className)} />;
}

/** Announces the loading state to screen readers once, without extra visuals. */
export function LoadingLabel({ children = "Loading…" }: { children?: string }) {
  return (
    <p role="status" className="sr-only">
      {children}
    </p>
  );
}
