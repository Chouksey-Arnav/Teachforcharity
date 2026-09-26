import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "pine" | "brass" | "clay" | "sky" | "ink";
const tones: Record<Tone, string> = {
  neutral: "bg-paper-2 text-ink-2 ring-line-2",
  pine: "bg-pine-50 text-pine-800 ring-pine-200",
  brass: "bg-brass-50 text-brass-800 ring-brass-300/60",
  clay: "bg-clay-50 text-clay-800 ring-clay-500/25",
  sky: "bg-sky-100 text-sky-700 ring-sky-700/15",
  ink: "bg-ink text-white ring-ink",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

const SESSION_TONES: Record<string, Tone> = {
  pending: "brass",
  scheduled: "pine",
  completed: "sky",
  confirmed: "sky",
  verified: "pine",
  disputed: "clay",
  rejected: "clay",
  declined: "neutral",
  cancelled: "neutral",
  expired: "neutral",
};
export const sessionTone = (status: string): Tone => SESSION_TONES[status] ?? "neutral";
