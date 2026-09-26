"use client";
import { useOptimistic, useTransition } from "react";
import { setAccepting } from "@/app/actions/profile";
import { cn } from "@/lib/cn";

export function AcceptingToggle({ accepting }: { accepting: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(accepting);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimistic}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await setAccepting(!optimistic);
        })
      }
      className="inline-flex items-center gap-3 rounded-full border border-line-2 bg-card py-1.5 pl-4 pr-1.5 text-sm"
    >
      {optimistic ? "Accepting new students" : "Not accepting new students"}
      <span className={cn("relative h-6 w-10 rounded-full transition", optimistic ? "bg-pine-600" : "bg-paper-3")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", optimistic ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}
