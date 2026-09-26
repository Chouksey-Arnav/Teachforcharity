import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMySessions } from "@/lib/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { LessonCard } from "@/components/dashboard/lesson-card";
import { ScrollToFocus } from "@/components/dashboard/scroll-to-focus";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Lessons" };

export default async function LessonsPage({ searchParams }: PageProps<"/dashboard/lessons">) {
  const viewer = await requireViewer(["family", "tutor"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [action, upcoming, history] = await Promise.all([
    getMySessions(supabase, "action"),
    getMySessions(supabase, "upcoming"),
    getMySessions(supabase, "history", 200),
  ]);
  const focus = typeof sp.focus === "string" ? sp.focus : undefined;
  const requested = typeof sp.tab === "string" ? sp.tab : undefined;
  let tab = requested ?? (action.length ? "action" : "upcoming");
  if (focus && !requested) {
    tab = action.some((s) => s.id === focus) ? "action" : upcoming.some((s) => s.id === focus) ? "upcoming" : history.some((s) => s.id === focus) ? "history" : tab;
  }
  const lists = { action, upcoming, history } as const;
  const list = lists[tab as keyof typeof lists] ?? upcoming;
  const tabs = [
    { key: "action", label: "Needs you", count: action.length },
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
    { key: "history", label: "Past", count: history.length },
  ];

  return (
    <>
      <PageHeader
        title="Lessons"
        description={
          viewer.role === "tutor"
            ? "Answer requests, join lessons, and log them afterward so your hours count."
            : "Requests, booked lessons, and confirmations — all in one place. Times are Eastern."
        }
        actions={viewer.role === "family" ? <LinkButton href="/dashboard/tutors">Request a lesson</LinkButton> : undefined}
      />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/lessons?tab=${t.key}`}
            className={cn(
              "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition",
              tab === t.key ? "border-pine-700 font-medium text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold", t.key === "action" ? "bg-brass-500 text-pine-950" : "bg-paper-3 text-ink-2")}>
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty icon={<CalendarDays className="size-5" />} title={tab === "action" ? "You’re all caught up" : tab === "upcoming" ? "Nothing scheduled yet" : "No past lessons yet"}>
          {tab === "upcoming" && viewer.role === "family" && "Find a tutor and request a time — they’ll get an email right away."}
          {tab === "upcoming" && viewer.role === "tutor" && "When a family requests a lesson, it shows up under “Needs you” and in your email."}
        </Empty>
      ) : (
        <div className="grid gap-4">
          {list.map((s) => (
            <LessonCard key={s.id} s={s} focus={s.id === focus} />
          ))}
        </div>
      )}
      {focus && <ScrollToFocus id={`lesson-${focus}`} />}
    </>
  );
}
