import Link from "next/link";
import { ArrowRight, CalendarDays, CalendarPlus, MessageCircle } from "lucide-react";
import type { MySession } from "@/lib/data";
import { LessonCard } from "@/components/dashboard/lesson-card";
import { Avatar } from "@/components/ui/avatar";
import { formatTime, formatWhen, startsIn } from "@/lib/time";

const LESSON_DONE = ["scheduled", "completed", "confirmed", "verified"];

/** The next booked lesson, full size (so Join works from here), then a compact list of the ones after it. */
export function NextLessonSection({ upcoming, isStudent }: { upcoming: MySession[]; isStudent: boolean }) {
  const scheduled = upcoming.filter((s) => s.status === "scheduled");
  const [next, ...later] = scheduled;
  return (
    <section className="mb-10" aria-labelledby="next-lesson">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="next-lesson" className="text-lg font-semibold">
            {next ? "Your next lesson" : "Coming up"}
          </h2>
          {next && (
            <p className="text-sm text-muted">
              <strong className="font-semibold text-pine-800">Starts {startsIn(next.start_at)}</strong> · Join opens 15 minutes before
            </p>
          )}
        </div>
        <Link href="/dashboard/lessons?tab=upcoming" className="shrink-0 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
          All lessons
        </Link>
      </div>
      {next ? (
        <>
          <LessonCard s={next} />
          {later.length > 0 && (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {later.slice(0, 3).map((s) => (
                <li key={s.id}>
                  <Link href={`/dashboard/lessons?focus=${s.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-paper/70 sm:px-5">
                    <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      <strong className="font-medium">{formatWhen(s.start_at)}</strong>
                      <span className="text-muted">
                        {" "}
                        – {formatTime(s.end_at)} · {s.subject_name} with {s.tutor_name}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden />
                  </Link>
                </li>
              ))}
              {later.length > 3 && (
                <li>
                  <Link href="/dashboard/lessons?tab=upcoming" className="block px-4 py-2.5 text-center text-[13px] font-medium text-pine-700 hover:bg-paper/70">
                    +{later.length - 3} more booked
                  </Link>
                </li>
              )}
            </ul>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-2 px-5 py-6 text-sm text-muted sm:flex-row sm:items-center">
          <CalendarDays className="size-5 shrink-0 text-faint" aria-hidden />
          <p className="flex-1">{isStudent ? "No lessons booked yet. Pick a tutor and tap a time that works for you." : "No lessons booked yet. Tap an open time on any tutor to request it."}</p>
          <Link href="/dashboard/tutors" className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full bg-ink shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px px-4 text-[13px] font-semibold text-cream sm:self-auto">
            Find a time <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}

export interface MyTutor {
  tutorId: string;
  name: string;
  avatar: string | null;
  studentId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  threadId: string | null;
}

/** Tutors this family already has lessons with, newest first, one per tutor + student. */
export function myTutors(sessions: MySession[]): MyTutor[] {
  const seen = new Set<string>();
  const out: MyTutor[] = [];
  for (const s of [...sessions].sort((a, b) => b.start_at.localeCompare(a.start_at))) {
    const key = `${s.tutor_id}:${s.student_id}`;
    if (seen.has(key) || !LESSON_DONE.includes(s.status)) continue;
    seen.add(key);
    out.push({
      tutorId: s.tutor_id,
      name: s.tutor_name,
      avatar: s.tutor_avatar,
      studentId: s.student_id,
      studentName: s.student_name,
      subjectId: s.subject_id,
      subjectName: s.subject_name,
      threadId: s.thread_id,
    });
  }
  return out;
}

/** One tap to message a current tutor or book the next lesson with them. */
export function YourTutors({ tutors, isStudent, multipleStudents }: { tutors: MyTutor[]; isStudent: boolean; multipleStudents: boolean }) {
  if (!tutors.length) return null;
  return (
    <section className="mb-10" aria-labelledby="your-tutors">
      <h2 id="your-tutors" className="mb-3 text-lg font-semibold">
        {isStudent ? "Your tutors" : "Your family’s tutors"}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tutors.map((t) => {
          const profile = `/dashboard/tutors/${t.tutorId}?student=${t.studentId}&subject=${t.subjectId}`;
          return (
            <article key={`${t.tutorId}:${t.studentId}`} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
              <Link href={profile} className="shrink-0" aria-label={`${t.name}’s profile`}>
                <Avatar name={t.name} path={t.avatar} size={48} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={profile} className="block truncate text-[15px] font-semibold hover:underline">
                  {t.name}
                </Link>
                <p className="truncate text-[13px] text-muted">
                  {t.subjectName}
                  {multipleStudents && ` · ${t.studentName}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Link
                  href={t.threadId ? `/dashboard/messages/${t.threadId}` : profile}
                  className="flex size-10 items-center justify-center rounded-full border border-line-2 text-ink-2 hover:border-ink/30 hover:text-ink"
                  aria-label={`Message ${t.name}`}
                  title="Message"
                >
                  <MessageCircle className="size-[18px]" aria-hidden />
                </Link>
                <Link
                  href={`${profile}#book`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px px-3.5 text-[13px] font-semibold text-cream"
                  aria-label={`Book again with ${t.name}`}
                >
                  <CalendarPlus className="size-4" aria-hidden /> Book
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
