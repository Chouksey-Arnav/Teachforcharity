import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ListChecks, MessageCircle, Users } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyStudents } from "@/lib/data";
import { formatRelative, formatWhen } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "My students" };

export default async function MyStudentsPage() {
  await requireViewer(["tutor"]);
  const supabase = await createClient();
  const students = await getMyStudents(supabase);

  return (
    <>
      <PageHeader
        eyebrow="Teaching"
        title={
          <>
            My <em>students</em>
          </>
        }
        description="Everyone you teach: the next lesson, lessons to log, and how their practice is going."
      />
      {students.length === 0 ? (
        <Empty icon={<Users className="size-5" />} title="No students yet" action={<LinkButton href="/dashboard/find-students" size="sm">Find students</LinkButton>}>
          When you have a lesson booked with a student, they show up here.
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {students.map((st) => {
            const total = st.open_tasks + st.done_tasks;
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
                      {total ? (
                        <span className="flex items-center gap-2">
                          <span>
                            {st.done_tasks} of {total} practice tasks done
                            {st.last_practice_at && <span className="text-muted"> · last ticked {formatRelative(st.last_practice_at)}</span>}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted">No practice assigned yet</span>
                      )}
                    </dd>
                  </div>
                </dl>
                {total > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-2" aria-hidden>
                    <div className="h-full rounded-full bg-pine-700" style={{ width: `${Math.round((st.done_tasks / total) * 100)}%` }} />
                  </div>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <LinkButton href={`/dashboard/my-students/${st.student_id}#practice`} size="sm">
                    <ListChecks className="size-4" /> Practice
                  </LinkButton>
                  {st.thread_id && (
                    <LinkButton href={`/dashboard/messages/${st.thread_id}`} size="sm" variant="secondary">
                      <MessageCircle className="size-4" /> Message
                    </LinkButton>
                  )}
                  {st.needs_log > 0 && (
                    <LinkButton href="/dashboard/lessons?tab=action" size="sm" variant="ghost">
                      Log lesson
                    </LinkButton>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
