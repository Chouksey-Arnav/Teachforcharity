import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CalendarDays, Music2 } from "lucide-react";
import { verifyLessonToken } from "@/lib/links";
import { createServiceClient } from "@/lib/supabase/admin";
import { formatWhen } from "@/lib/time";
import { Notice } from "@/components/ui/notice";
import { ConfirmChoices } from "./client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm a lesson", robots: { index: false, follow: false }, referrer: "no-referrer" };

interface Lesson {
  id: string;
  status: string;
  start_at: string;
  minutes: number;
  subject: string;
  student_name: string;
  tutor_name: string;
  practice_plan: string | null;
}

/**
 * Opened from the "did the lesson happen?" email. Viewing the page changes
 * nothing (email scanners open links); answering takes a button press.
 */
export default async function ConfirmLessonPage({ params }: PageProps<"/confirm/[token]">) {
  const { token } = await params;
  const check = verifyLessonToken(decodeURIComponent(token));
  const db = createServiceClient();
  const lesson = check.ok && db ? ((await db.rpc("lesson_for_link", { p_session: check.sessionId })).data as unknown as Lesson | null) : null;

  if (!lesson)
    return (
      <div className="lm-wash"><div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="eyebrow">Lesson confirmation</p>
        <h1 className="display mt-3 text-4xl">{!check.ok && check.reason === "expired" ? "This link has expired" : "This link doesn’t work"}</h1>
        <p className="mt-3 text-muted">You can still confirm the lesson from your dashboard.</p>
        <Link href="/dashboard/lessons?tab=action" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px px-5 text-sm font-semibold text-cream">
          Sign in to confirm
        </Link>
      </div></div>
    );

  const answered = lesson.status !== "completed";
  return (
    <div className="lm-wash"><div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-20">
      <p className="eyebrow">Lesson confirmation</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">Did {lesson.student_name}’s lesson happen?</h1>
      <div className="mt-6 space-y-2 rounded-2xl border border-line bg-card p-5 text-[15px]">
        <p className="flex items-center gap-2">
          <Music2 className="size-4 text-pine-700" aria-hidden /> {lesson.subject} with {lesson.tutor_name}
        </p>
        <p className="flex items-center gap-2 text-muted">
          <CalendarDays className="size-4" aria-hidden /> {formatWhen(lesson.start_at)} · {lesson.minutes} minutes
        </p>
        {lesson.practice_plan && (
          <div className="mt-3 rounded-xl bg-paper-2/70 px-4 py-3 text-sm">
            <p className="font-semibold">What to practice</p>
            <p className="mt-1 whitespace-pre-line text-ink-2">{lesson.practice_plan}</p>
          </div>
        )}
      </div>
      {answered ? (
        <Notice tone={lesson.status === "disputed" ? "warning" : "success"} className="mt-6" title={lesson.status === "disputed" ? "You reported a problem" : "Already confirmed"}>
          {lesson.status === "disputed" ? (
            "The program team is reviewing it. Thank you for letting us know."
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="size-4" aria-hidden /> Thanks — nothing else to do.
            </span>
          )}
        </Notice>
      ) : (
        <ConfirmChoices token={decodeURIComponent(token)} tutorName={lesson.tutor_name} />
      )}
    </div></div>
  );
}
