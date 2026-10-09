import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, ListChecks } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyPractice, getMySessions } from "@/lib/data";
import { easternDate } from "@/lib/practice";
import { formatDate, formatTime, formatWhen } from "@/lib/time";
import { BackLink } from "@/components/dashboard/back-link";
import { PageHeader } from "@/components/dashboard/page-header";
import { LessonCard } from "@/components/dashboard/lesson-card";
import { PracticeBoard } from "@/components/dashboard/practice-board";
import { PracticeComposer } from "@/components/dashboard/practice-fields";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Lesson" };

type Step = { at: string; from_status: string | null; to_status: string; note: string | null; by_side: string };

/** What each step of a lesson's life means, in the reader's words. */
function stepLabel(s: Step, isTutor: boolean, other: string): string {
  switch (s.to_status) {
    case "pending":
      return s.from_status === "pending" ? "New time suggested" : s.by_side === "tutor" ? (isTutor ? "You proposed this lesson" : `${other} proposed this lesson`) : isTutor ? `${other} requested this lesson` : "You requested this lesson";
    case "scheduled":
      return "Booked";
    case "completed":
      return isTutor ? "You logged the lesson" : `${other} logged the lesson`;
    case "confirmed":
      return isTutor ? `${other} confirmed you were there` : `You confirmed ${other} was there`;
    case "verified":
      return "Hours certified by the partner nonprofit";
    case "disputed":
      return isTutor ? `${other} said you weren’t there` : `You said ${other} wasn’t there`;
    case "rejected":
      return "Hours not verified";
    case "cancelled":
      return "Cancelled";
    case "declined":
      return "Declined";
    case "expired":
      return "Request expired";
    default:
      return s.to_status;
  }
}

export default async function LessonPage({ params }: PageProps<"/dashboard/lessons/[id]">) {
  const viewer = await requireViewer(["family", "tutor"]);
  const { id } = await params;
  const supabase = await createClient();
  const [all, practice, { data: steps }] = await Promise.all([
    getMySessions(supabase, "all", 500),
    getMyPractice(supabase, { sessionId: id }),
    supabase.rpc("lesson_timeline", { p_session: id }),
  ]);
  const s = all.find((x) => x.id === id);
  if (!s) notFound();
  const isTutor = s.my_side === "tutor";
  const other = isTutor ? s.student_name : s.tutor_name;
  const next = all
    .filter((x) => x.tutor_id === s.tutor_id && x.student_id === s.student_id && x.status === "scheduled" && x.end_at > new Date().toISOString() && x.id !== s.id)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  const happened = ["completed", "confirmed", "verified"].includes(s.status);
  const ended = new Date(s.end_at).getTime() <= Date.now();
  const nextDate = next ? easternDate(0, new Date(next.start_at)) : null;

  return (
    <>
      <BackLink href={isTutor ? `/dashboard/my-students/${s.student_id}` : "/dashboard/lessons?tab=history"} label={isTutor ? s.student_name : "Lessons"} />
      <PageHeader
        eyebrow={formatDate(s.start_at)}
        title={
          <>
            {s.subject_name} with <em>{isTutor ? s.student_name : s.tutor_name}</em>
          </>
        }
        description={`${formatTime(s.start_at)}–${formatTime(s.end_at)} ET · ${s.duration_minutes} minutes`}
      />

      <LessonCard s={s} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.25fr]">
        <Card className="h-fit p-5 sm:p-6">
          <p className="eyebrow">What happened</p>
          {steps?.length ? (
            <ol className="mt-4 space-y-4">
              {(steps as Step[]).map((st, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 shrink-0 pt-0.5 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-medium">{stepLabel(st, isTutor, other)}</p>
                    <p className="text-[12.5px] text-muted">{formatWhen(st.at)}</p>
                    {st.note && st.to_status !== "pending" && <p className="mt-1 text-[13px] text-ink-2">“{st.note}”</p>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted">Nothing recorded yet.</p>
          )}
          {next && (
            <Link href={`/dashboard/lessons/${next.id}`} className="mt-6 flex items-center gap-3 rounded-2xl bg-paper-2/70 px-4 py-3 text-sm transition hover:bg-paper-2">
              <CalendarDays className="size-4 shrink-0 text-pine-700" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">Next lesson together</span>
                <strong className="font-medium">{formatWhen(next.start_at)}</strong>
              </span>
              <ArrowRight className="size-4 text-faint" aria-hidden />
            </Link>
          )}
        </Card>

        <section aria-labelledby="lesson-practice">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 id="lesson-practice" className="display text-[26px]">
              Practice from this lesson
            </h2>
            {!isTutor && practice.length > 0 && (
              <Link href="/dashboard/practice" className="shrink-0 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
                Whole board
              </Link>
            )}
          </div>
          {practice.length > 0 ? (
            <PracticeBoard items={practice} view={isTutor ? "tutor" : "family"} />
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-dashed border-line-2 px-5 py-5 text-sm text-muted">
              <ListChecks className="mt-0.5 size-5 shrink-0 text-faint" aria-hidden />
              <p>
                {isTutor
                  ? happened
                    ? `No practice yet. Add tasks below and they go straight to ${s.student_name}’s board.`
                    : ended && s.status === "scheduled"
                      ? "Log this lesson (above) and you can add practice in the same step."
                      : "You can add practice once the lesson has happened."
                  : `${s.tutor_name} hasn’t left practice for this lesson.`}
              </p>
            </div>
          )}
          {isTutor && happened && (
            <Card className="mt-4 p-5 sm:p-6">
              <p className="eyebrow mb-3">Add practice for {s.student_name}</p>
              <PracticeComposer studentId={s.student_id} studentName={s.student_name} sessionId={s.id} nextLesson={nextDate} idPrefix={`lesson-${s.id}`} />
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
