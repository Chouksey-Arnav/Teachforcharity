import Link from "next/link";
import { ArrowRight, CalendarDays, CalendarPlus, MessageCircle } from "lucide-react";
import type { MySession } from "@/lib/data";
import { LessonCard } from "@/components/dashboard/lesson-card";
import { BookAgain } from "@/components/dashboard/book-again";
import { Avatar } from "@/components/ui/avatar";
import { formatTime, formatWhen, startsIn } from "@/lib/time";

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
  teachershipId: string;
  tutorId: string;
  name: string;
  avatar: string | null;
  studentId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  threadId: string | null;
  nextLessonAt: string | null;
  instant: boolean;
  /** Why booking isn't possible right now, if it isn't. */
  blocked: "tutor_unavailable" | "consent" | null;
  /** The suggested next lesson: same weekday and time as the last one, if it's open. */
  again: { date: string; time: string; start: string } | null;
  minutes: number;
}

/** The tutors each student works with: next lesson, one tap to message, and "Book again". */
export function YourTutors({ tutors, isStudent, multipleStudents }: { tutors: MyTutor[]; isStudent: boolean; multipleStudents: boolean }) {
  if (!tutors.length) return null;
  return (
    <section className="mb-10" aria-labelledby="your-tutors">
      <h2 id="your-tutors" className="mb-3 text-lg font-semibold">
        {isStudent ? (tutors.length === 1 ? "Your tutor" : "Your tutors") : "Your family’s tutors"}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {tutors.map((t) => {
          const profile = `/dashboard/tutors/${t.tutorId}?student=${t.studentId}&subject=${t.subjectId}`;
          const first = t.name.split(" ")[0];
          return (
            <article key={t.teachershipId} className="flex min-w-0 animate-rise flex-col gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
              <div className="flex items-center gap-3">
                <Link href={profile} className="shrink-0" tabIndex={-1} aria-hidden>
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
                <Link
                  href={t.threadId ? `/dashboard/messages/${t.threadId}` : profile}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-2 text-ink-2 hover:border-ink/30 hover:text-ink"
                  aria-label={`Message ${t.name}`}
                  title="Message"
                >
                  <MessageCircle className="size-[18px]" aria-hidden />
                </Link>
              </div>
              <p className="flex items-center gap-1.5 text-[13.5px] text-ink-2">
                <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
                {t.nextLessonAt ? (
                  <>
                    Next: <strong className="font-semibold text-ink">{formatWhen(t.nextLessonAt)}</strong>
                  </>
                ) : (
                  <span className="text-muted">No lesson booked yet</span>
                )}
              </p>
              {t.blocked ? (
                <p className="rounded-xl bg-paper-2/60 px-3.5 py-3 text-[13px] text-muted">
                  {t.blocked === "consent"
                    ? isStudent
                      ? "Booking opens again once your parent approves."
                      : `Sign the consent form for ${t.studentName} to book again.`
                    : `${first} isn’t taking lessons right now. You can still read your messages.`}
                </p>
              ) : t.again ? (
                <BookAgain
                  tutorFirst={first}
                  studentId={t.studentId}
                  tutorId={t.tutorId}
                  subjectId={t.subjectId}
                  slot={t.again}
                  minutes={t.minutes}
                  instant={t.instant}
                  pickHref={`${profile}#book`}
                />
              ) : (
                <Link
                  href={`${profile}#book`}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-semibold text-cream shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px"
                >
                  <CalendarPlus className="size-4" aria-hidden /> {t.instant ? `Book with ${first}` : `Ask ${first} for a time`}
                </Link>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
