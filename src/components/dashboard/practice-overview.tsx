import Link from "next/link";
import { ChevronRight, Flame, ListChecks } from "lucide-react";
import { easternDate, type StudentPractice } from "@/lib/practice";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PracticeLegend, PracticeWeek } from "@/components/dashboard/practice-week";

/** "2 of 3 practised today", "1 task finished today" or "Nothing ticked yet today". */
export function todayLine(p: StudentPractice): string {
  if (p.today.daily > 0) return `${p.today.ticked} of ${p.today.daily} practised today`;
  if (p.today.finished > 0) return `${p.today.finished} ${p.today.finished === 1 ? "task" : "tasks"} finished today`;
  return p.openTasks ? `${p.openTasks} ${p.openTasks === 1 ? "task" : "tasks"} to do` : "Nothing to practise today";
}

/**
 * The tutor's home: how each student is practising, day by day, this week.
 * Students with nothing assigned get a nudge to send something.
 */
export function PracticeOverview({ students }: { students: { id: string; name: string; practice?: StudentPractice }[] }) {
  if (!students.length) return null;
  const today = easternDate(0);
  const withTasks = students.filter((s) => s.practice?.hasTasks);
  const without = students.filter((s) => !s.practice?.hasTasks);
  return (
    <section className="mb-10 animate-rise" aria-labelledby="practice-week-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Practice</p>
          <h2 id="practice-week-title" className="display text-[26px] leading-tight">
            This <em>week</em>
          </h2>
        </div>
        {withTasks.length > 0 && <PracticeLegend />}
      </div>
      <div className="overflow-hidden rounded-[22px] border border-line bg-card shadow-card">
        <ul className="divide-y divide-line">
          {withTasks.map(({ id, name, practice: p }) => (
            <li key={id}>
              <Link
                href={`/dashboard/my-students/${id}#practice`}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-paper/60 sm:grid-cols-[auto_minmax(0,11rem)_1fr_auto] sm:px-5"
              >
                <Avatar name={name} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{name}</span>
                  <span className="block truncate text-[12.5px] text-muted">{todayLine(p!)}</span>
                </span>
                <span className="col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto">
                  <PracticeWeek days={p!.days} today={today} label={`${name}'s practice, last 7 days`} />
                </span>
                <span className="col-start-3 row-start-1 flex items-center gap-1.5 sm:col-start-auto sm:row-start-auto">
                  {p!.overdue > 0 && <Badge tone="clay">{p!.overdue} overdue</Badge>}
                  {p!.streak > 1 && (
                    <span className="flex items-center gap-0.5 font-mono text-[12px] font-semibold text-brass-800" title={`${p!.streak} days in a row`}>
                      <Flame className="size-3.5" aria-hidden />
                      {p!.streak}
                      <span className="sr-only"> days in a row</span>
                    </span>
                  )}
                  <ChevronRight className="size-4 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
          {without.map(({ id, name }) => (
            <li key={id} className="flex items-center gap-3 px-4 py-3 text-[14px] sm:px-5">
              <Avatar name={name} size={36} />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{name}</span> <span className="text-muted">· no practice assigned yet</span>
              </span>
              <Link
                href={`/dashboard/my-students/${id}#practice`}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line-2 px-3 text-[13px] font-semibold text-ink-2 transition hover:-translate-y-px hover:border-ink/30 hover:text-ink"
              >
                <ListChecks className="size-3.5" aria-hidden /> Send practice
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
