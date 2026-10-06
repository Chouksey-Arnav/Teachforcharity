"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Eye, MessageCircle, ShieldCheck, Sparkles, UserRound, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/time";

export type CheckStatus = "unverified" | "stale" | "verified" | "review" | "blocked";

/** What the automated account check looks at, in words a tutor can read. Never the rules themselves. */
const STAGES = [
  { icon: UserRound, label: "Identity", detail: "Your real name, and a parent who isn’t you" },
  { icon: Sparkles, label: "Profile", detail: "Bio, school, grade and Meet link" },
  { icon: MessageCircle, label: "Conversations", detail: "Messages stay kind, safe and on the site" },
  { icon: ShieldCheck, label: "Conduct", detail: "No open reports" },
  { icon: CalendarCheck, label: "Attendance", detail: "Logged lessons match what students say" },
] as const;

/** How long the page keeps refreshing itself while a check is running. */
const WATCH_MS = 5 * 60_000;
const EVERY_MS = 5_000;

/**
 * The tutor's view of the automated account check, from "checking" to "you're
 * live". While the check runs it refreshes itself every few seconds (for up
 * to five minutes), so the result appears without reloading.
 */
export function AccountCheckPanel({
  status,
  checkedAt,
  hints,
  live,
}: {
  status: CheckStatus | null;
  checkedAt: string | null;
  hints: string[];
  /** The tutor is active (families can see them). */
  live: boolean;
}) {
  const router = useRouter();
  const running = !live && (status === null || status === "unverified" || status === "stale" || status === "verified");
  const [startedAt] = useState(() => Date.now());
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      if (Date.now() - startedAt > WATCH_MS) {
        setSlow(true);
        clearInterval(tick);
      } else router.refresh();
    }, EVERY_MS);
    return () => clearInterval(tick);
  }, [running, router, startedAt]);

  if (live) {
    // Celebrate once, the day it happens; after that the dashboard speaks for itself.
    if (status !== "verified" || !checkedAt || Date.now() - new Date(checkedAt).getTime() > 86_400_000) return null;
    return (
      <Panel tone="live" eyebrow="Account check passed" title={<>You’re <em>live</em></>}>
        <p className="text-sm leading-relaxed text-ink-2">
          Every check passed {formatRelative(checkedAt)}. Families matched to your instruments can see you and request lessons now.
        </p>
        <Stages state="done" />
        <div className="mt-5">
          <Link href="/dashboard/find-students" className="text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
            See students who fit you →
          </Link>
        </div>
      </Panel>
    );
  }

  if (status === "review" || status === "blocked") {
    return (
      <Panel tone="review" eyebrow="Account check" title={<>A person is taking a <em>closer</em> look</>}>
        <p className="text-sm leading-relaxed text-ink-2">
          Our automated check sent your account to the program team. That happens for lots of reasons and isn’t a judgment — they’ll be in touch, usually within a couple of days.
        </p>
        {hints.length > 0 && <Hints hints={hints} intro="You can fix these yourself, and we’ll check again right away:" />}
      </Panel>
    );
  }

  return (
    <Panel tone="running" eyebrow={checkedAt ? `Last checked ${formatRelative(checkedAt)}` : "Account check"} title={<>Checking your <em>account</em></>}>
      <p className="text-sm leading-relaxed text-ink-2" role="status">
        {slow
          ? "This is taking longer than usual. You can close this page — we’ll email you the moment you’re live."
          : "Every tutor goes through the same automated check before families can see them. It usually takes under a minute, and this page updates on its own."}
      </p>
      <Stages state="running" />
      {hints.length > 0 && <Hints hints={hints} intro="While you wait, these would make your profile stronger:" />}
    </Panel>
  );
}

function Panel({ tone, eyebrow, title, children }: { tone: "running" | "live" | "review"; eyebrow: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "mb-8 animate-rise overflow-hidden rounded-[28px] border p-5 shadow-card sm:p-7",
        tone === "live" ? "border-pine-200 bg-pine-50" : tone === "review" ? "border-brass-300/70 bg-brass-50" : "border-line bg-card",
      )}
    >
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display mt-2 text-[28px] leading-tight sm:text-3xl">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stages({ state }: { state: "running" | "done" }) {
  return (
    <ol className="mt-5 grid gap-2 sm:grid-cols-5">
      {STAGES.map(({ icon: Icon, label, detail }, i) => (
        <li
          key={label}
          className="flex animate-fade items-start gap-3 rounded-2xl border border-line bg-paper/60 p-3 sm:flex-col sm:gap-2"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              state === "done" ? "bg-pine-700 text-white" : "bg-brass-100 text-brass-800 ring-1 ring-brass-300/70",
            )}
          >
            {state === "done" ? <Check className="size-4" strokeWidth={2.6} aria-label="Passed" /> : <Icon className="size-4" aria-hidden />}
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-ink">{label}</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Hints({ hints, intro }: { hints: string[]; intro: string }) {
  return (
    <div className="mt-5 animate-fade rounded-2xl border border-line bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Eye className="size-4 text-pine-700" aria-hidden /> {intro}
      </p>
      <ul className="mt-2 space-y-1.5 pl-6 text-sm text-ink-2">
        {hints.map((h) => (
          <li key={h} className="list-disc">
            {h}
          </li>
        ))}
      </ul>
      <Link href="/dashboard/profile" className="mt-3 inline-block text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
        Edit your profile
      </Link>
    </div>
  );
}

