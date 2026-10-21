import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, ListChecks, MessageCircle, Users, Zap } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyPractice, getMySessions, getMyStudents, type MyStudent } from "@/lib/data";
import { practiceByStudent } from "@/lib/practice";
import { PracticeLegend, PracticeWeek } from "@/components/dashboard/practice-week";
import { todayLine } from "@/components/dashboard/practice-overview";
import { formatDate, formatWhen } from "@/lib/time";
import { RosterActions } from "@/components/dashboard/roster-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "My students" };

export default async function MyStudentsPage() {
  const viewer = await requireViewer(["tutor"]);
  const supabase = await createClient();
  const [all, action, practice] = await Promise.all([getMyStudents(supabase), getMySessions(supabase, "action"), getMyPractice(supabase)]);
  const byStudent = practiceByStudent(practice);
  const students = all.filter((s) => s.teachership_status === "active");
  const past = all.filter((s) => s.teachership_status !== "active");
  // New students asking for a lesson: answered in Lessons, never mixed into the roster.
  const requests = action.filter((s) => s.status === "pending" && !all.some((a) => a.teachership_status === "active" && a.student_id === s.student_id)).length;
  const tutorInstant = viewer.tutor?.instant_book ?? true;

  return (
    <>
      <PageHeader
        eyebrow="Teaching"
        title={
          <>
            My <em>students</em>
          </>
        }
        description="Everyone you teach: the next lesson, lessons to log, and how they’ve practised each day this week."
      />
      {requests > 0 && (
        <Link href="/dashboard/lessons?tab=action" className="mb-6 flex animate-rise items-center gap-3 rounded-2xl border border-brass-300 bg-brass-100/50 px-4 py-3 text-[14px] font-medium hover:shadow-card">
          <span className="flex size-8 items-center justify-center rounded-full bg-glow text-[13px] font-bold text-pine-950">{requests}</span>
          <span className="flex-1">{requests === 1 ? "A new student is asking for a lesson" : `${requests} new students are asking for lessons`}</span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
      {students.length === 0 ? (
        <Empty icon={<Users className="size-5" />} title="No students yet" action={<LinkButton href="/dashboard/find-students" size="sm">Find students</LinkButton>}>
          A student shows up here as soon as your first lesson together is booked.
        </Empty>
      ) : (
        <>
        <PracticeLegend className="mb-3" />
        <div className="grid gap-4 md:grid-cols-2">
          {students.map((st) => {
            const total = st.open_tasks + st.done_tasks;
            const p = byStudent.get(st.student_id);
            return (
              <article key={st.student_id} className="flex animate-rise flex-col rounded-[22px] border border-line bg-card p-5 shadow-card transition hover:shadow-lift">
                <Link href={`/dashboard/my-students/${st.student_id}`} className="flex items-center gap-3">
                  <Avatar name={st.first_name} size={48} />
                  <div className="min-w-0 flex-1">
                    <h2 className="display truncate text-[24px] leading-tight">{st.first_name}</h2>
                    <p className="truncate text-[13px] text-muted">
                      {st.grade}th grade · {st.subjects.join(", ") || "Lessons"}
                    </p>
                  </div>
                </Link>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {st.needs_log > 0 && <Badge tone="brass">{st.needs_log === 1 ? "1 lesson to log" : `${st.needs_log} lessons to log`}</Badge>}
                  {st.move_waiting > 0 && <Badge tone="brass">Wants to move a lesson</Badge>}
                  {tutorInstant && st.instant_book && (
                    <Badge tone="pine">
                      <Zap className="size-3" aria-hidden /> Instant booking
                    </Badge>
                  )}
                  {st.unread && <Badge tone="sky">New message</Badge>}
                  <Badge>{st.lessons_done === 1 ? "1 lesson together" : `${st.lessons_done} lessons together`}</Badge>
                </div>
                <dl className="mt-4 grid gap-2 text-[13.5px]">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
                    <dt className="sr-only">Next lesson</dt>
                    <dd>{st.next_lesson_at ? <>Next: <strong className="font-medium">{formatWhen(st.next_lesson_at)}</strong></> : <span className="text-muted">No lesson booked</span>}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <ListChecks className="size-4 shrink-0 text-muted" aria-hidden />
                    <dt className="sr-only">Practice</dt>
                    <dd className="min-w-0 flex-1">
                      {p?.hasTasks ? (
                        <span>
                          {todayLine(p)}
                          {p.overdue > 0 && <span className="text-clay-700"> · {p.overdue} overdue</span>}
                          {p.streak > 1 && <span className="text-muted"> · {p.streak} days in a row</span>}
                        </span>
                      ) : total ? (
                        <span>
                          {st.done_tasks} of {total} practice tasks done
                        </span>
                      ) : (
                        <span className="text-muted">No practice assigned yet</span>
                      )}
                    </dd>
                  </div>
                </dl>
                {p?.hasTasks && <PracticeWeek days={p.days} className="mt-3" label={`${st.first_name}'s practice, last 7 days`} />}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <LinkButton href={`/dashboard/my-students/${st.student_id}#practice`} size="sm">
                    <ListChecks className="size-4" /> Practice
                  </LinkButton>
                  {st.thread_id && (
                    <LinkButton href={`/dashboard/messages/${st.thread_id}`} size="sm" variant="secondary">
                      <MessageCircle className="size-4" /> Message
                    </LinkButton>
                  )}
                  {(st.needs_log > 0 || st.move_waiting > 0) && (
                    <LinkButton href="/dashboard/lessons?tab=action" size="sm" variant="ghost">
                      {st.needs_log > 0 ? "Log lesson" : "Answer"}
                    </LinkButton>
                  )}
                </div>
                <RosterActions
                  teachershipId={st.teachership_id}
                  studentId={st.student_id}
                  studentName={st.first_name}
                  subjectId={st.subject_id}
                  instantBook={st.instant_book}
                  tutorInstantBook={tutorInstant}
                  active
                />
              </article>
            );
          })}
        </div>
        </>
      )}
      {past.length > 0 && <PastStudents rows={past} />}
    </>
  );
}

/** Students you taught before. Booking again with them starts fresh (as a new request). */
function PastStudents({ rows }: { rows: MyStudent[] }) {
  return (
    <details className="mt-10 rounded-2xl border border-line bg-card/70 px-5 py-4">
      <summary className="cursor-pointer text-[14px] font-semibold">Past students · {rows.length}</summary>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((st) => (
          <li key={st.teachership_id} className="flex items-center gap-3 py-2.5 text-[14px]">
            <Avatar name={st.first_name} size={32} />
            <span className="min-w-0 flex-1 truncate">
              <Link href={`/dashboard/my-students/${st.student_id}`} className="font-medium hover:underline">
                {st.first_name}
              </Link>
              <span className="text-muted">
                {" "}
                · {st.lessons_done} lesson{st.lessons_done === 1 ? "" : "s"}
                {st.ended_at ? ` · until ${formatDate(st.ended_at)}` : ""}
              </span>
            </span>
            {st.thread_id && (
              <Link href={`/dashboard/messages/${st.thread_id}`} className="text-[13px] text-muted hover:text-ink" aria-label={`Message ${st.first_name}`}>
                <MessageCircle className="size-4" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
