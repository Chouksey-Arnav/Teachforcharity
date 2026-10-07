import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, Info, MapPin, Music2, School } from "lucide-react";
import { BackLink } from "@/components/dashboard/back-link";
import { requireViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { OPEN_SLOT_DAYS, consentState, getCurrentTutorIds, getFamilyStudents, getMySessions, getMyThreads, getTutor, studentBusy, toStudentProfile } from "@/lib/data";
import { TIER_LABEL, WEIGHTS, matchTutors } from "@/lib/matching";
import { EXPLAIN_STYLES, LEVEL_INFO, TEACHING_STYLES, ensembleLabel, goalLabel, interestLabel } from "@/lib/constants";
import { bestSlot, defaultMinutes, friendlyDay, openSlots } from "@/lib/slots";
import { formatTime } from "@/lib/time";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { SlotGrid } from "@/components/forms/slot-grid";
import { MatchScore } from "@/components/dashboard/tutor-card";
import { RequestLessonForm } from "./request-form";
import { MessageTutorButton, StickyBookBar } from "./profile-actions";

export const metadata: Metadata = { title: "Tutor profile" };

export default async function TutorProfilePage({ params, searchParams }: PageProps<"/dashboard/tutors/[id]">) {
  const viewer = await requireViewer(["family"]);
  const isStudent = viewer.profile.account_kind === "student";
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const config = await getPublicConfig();
  const tutor = await getTutor(supabase, id);
  if (!tutor) notFound();

  const students = (await getFamilyStudents(supabase, viewer.id, config)).filter((s) => s.subjects.length);
  const student = students.find((s) => s.id === sp.student) ?? students[0];
  const from = new Date();
  const to = new Date(from.getTime() + (OPEN_SLOT_DAYS + 1) * 86400000);
  const [current, { data: tutorBusy }, mine, threads] = await Promise.all([
    student ? getCurrentTutorIds(supabase, student.id) : Promise.resolve([]),
    // Open times: the tutor's existing lessons/requests (times only) and each student's own.
    supabase.rpc("tutor_busy_times", { p_tutor: tutor.tutorId, p_from: from.toISOString(), p_to: to.toISOString() }),
    getMySessions(supabase, "upcoming", 200),
    getMyThreads(supabase),
  ]);
  const target = student?.subjects.find((x) => x.subject_id === sp.subject) ?? student?.subjects[0];
  const match = student && target ? matchTutors(toStudentProfile(student, current), target.subject_id, [tutor], { includeRelated: "always" })[0] : undefined;
  const hours = (tutor.verifiedMinutes / 60).toFixed(1).replace(/\.0$/, "");
  const busy = (tutorBusy ?? []).map((b) => ({ start: b.start_at, end: b.end_at }));
  const first = tutor.displayName.split(" ")[0];
  const consent = student ? consentState(student) : "none";
  const canRequest = match ? match.canRequest : tutor.acceptingStudents;
  const thread = threads.find((t) => t.tutor_id === tutor.tutorId && t.student_id === student?.id);
  const threadHref = thread ? `/dashboard/messages/${thread.id}` : undefined;
  const next = bestSlot(
    openSlots({
      tutorAvailability: tutor.availability,
      studentAvailability: student?.availability ?? [],
      busy: [...busy, ...(student ? studentBusy(mine, student.id) : [])],
      minutes: defaultMinutes(tutor.sessionMinutes, student?.preferred_minutes),
      days: OPEN_SLOT_DAYS,
    }),
  );
  const nextLabel = next ? `${friendlyDay(next.date)} at ${formatTime(next.start)}` : null;
  const studentInterests = student?.interests ?? [];
  const breakdown = match
    ? ([
        ["Level fit", match.breakdown.level, WEIGHTS.level],
        ["Shared schedule", match.breakdown.availability, WEIGHTS.availability],
        ["Goals", match.breakdown.goals, WEIGHTS.goals],
        ...(studentInterests.length ? ([["Music you both like", match.breakdown.interests, WEIGHTS.interests]] as const) : []),
        ["Learning style", match.breakdown.style, WEIGHTS.style],
        ["Open spots", match.breakdown.capacity, WEIGHTS.capacity],
      ] as const)
    : [];

  return (
    <>
      <BackLink href={`/dashboard/tutors${student ? `?student=${student.id}` : ""}`} label="All tutors" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <header className="rounded-3xl border border-line bg-card p-5 shadow-card sm:p-7">
            <div className="flex items-start gap-4 sm:gap-6">
              <Avatar name={tutor.displayName} path={tutor.avatarPath} size={88} className="hidden sm:inline-flex" />
              <Avatar name={tutor.displayName} path={tutor.avatarPath} size={64} className="sm:hidden" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {match && <Badge tone={match.tier === "ideal" ? "pine" : match.tier === "full" ? "neutral" : "brass"}>{current.includes(tutor.tutorId) ? "Your tutor" : TIER_LABEL[match.tier]}</Badge>}
                  {!tutor.acceptingStudents && <Badge tone="brass">Not taking new students</Badge>}
                </div>
                <h1 className="display mt-1.5 text-4xl sm:text-5xl">{tutor.displayName}</h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <School className="size-4" aria-hidden /> {tutor.grade ? `${tutor.grade}th grade` : "High school"}
                    {tutor.school ? ` · ${tutor.school}` : ""}
                  </span>
                  {tutor.county && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden /> {tutor.county} County
                    </span>
                  )}
                </p>
              </div>
              {match && (
                <div className="hidden flex-col items-center gap-1 sm:flex">
                  <MatchScore score={match.score} tier={match.tier} size={60} />
                  <span className="text-[11px] text-muted">match</span>
                </div>
              )}
            </div>

            <dl className="mt-5 grid grid-cols-3 divide-x divide-line rounded-2xl bg-paper-2/60 py-3 text-center">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted">Lessons</dt>
                <dd className="mt-0.5 text-[17px] font-semibold">{tutor.lessonsCompleted || "New"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted">Verified hrs</dt>
                <dd className="mt-0.5 text-[17px] font-semibold">{tutor.verifiedMinutes > 0 ? hours : "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted">Lengths</dt>
                <dd className="mt-0.5 text-[17px] font-semibold">{tutor.sessionMinutes.join("/")}m</dd>
              </div>
            </dl>

            {canRequest && (
              <p className="mt-4 flex items-center gap-2 text-[14px] text-ink-2">
                <CalendarClock className="size-4 text-pine-700" aria-hidden />
                {nextLabel ? (
                  <>
                    Next open time: <strong className="font-semibold text-ink">{nextLabel}</strong>
                  </>
                ) : (
                  "No open times in the next two weeks — you can suggest one."
                )}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {canRequest && (
                <a href="#book" className="inline-flex h-10 items-center gap-2 rounded-full bg-ink shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px px-5 text-sm font-semibold text-cream lg:hidden">
                  Book a lesson
                </a>
              )}
              <MessageTutorButton
                tutorId={tutor.tutorId}
                studentId={student?.id}
                threadHref={threadHref}
                label={`Message ${first}`}
                disabledReason={consent !== "active" ? (isStudent ? "Messaging opens once your parent approves." : "Messaging opens once you sign the consent form.") : undefined}
              />
            </div>
          </header>

          {tutor.bio && (
            <section aria-labelledby="about" className="px-1">
              <h2 id="about" className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted">
                About {first}
              </h2>
              <p className="whitespace-pre-line text-[17px] leading-relaxed text-ink-2">{tutor.bio}</p>
            </section>
          )}

          {match && student && (
            <Card>
              <CardHeader title={`Why ${first} fits ${isStudent ? "you" : student.first_name}`} description="How the match score is calculated" />
              <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
                <ul className="space-y-2 text-sm text-ink-2">
                  {match.reasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-pine-600" aria-hidden /> {r}
                    </li>
                  ))}
                  {match.cautions.map((r) => (
                    <li key={r} className="flex gap-2 text-muted">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brass-500" aria-hidden /> {r}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-2.5" aria-label="Match score breakdown">
                  {breakdown.map(([label, v, max]) => (
                    <li key={label}>
                      <div className="flex justify-between text-xs text-muted">
                        <span>{label}</span>
                        <span className="tabular-nums">
                          {Math.round(v)}/{max}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-3" aria-hidden>
                        <div className="h-full rounded-full bg-pine-600" style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Instruments" description="Self-reported by the tutor — not independently verified." />
            <ul className="divide-y divide-line">
              {tutor.subjects.map((s) => (
                <li key={s.subjectId} className="flex items-start gap-4 px-5 py-4 sm:px-6">
                  <Music2 className="mt-0.5 size-5 text-pine-700" aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted">
                      {s.yearsPlaying} year{s.yearsPlaying === 1 ? "" : "s"} · {ensembleLabel(s.topEnsemble)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {s.teachLevels.map((l) => (
                      <Badge key={l} tone={target && target.subject_id === s.subjectId && target.level === l ? "pine" : "neutral"}>
                        Teaches {LEVEL_INFO[l].label.toLowerCase()}
                      </Badge>
                    ))}
                  </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-6">
            <Card className="p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold">Teaching style</h2>
              <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Lessons</dt>
                  <dd>{TEACHING_STYLES.find((t) => t.key === tutor.teachingStyle)?.tutor ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Explains by</dt>
                  <dd>{EXPLAIN_STYLES.find((t) => t.key === tutor.explainStyle)?.tutor ?? "—"}</dd>
                </div>
                {tutor.teachingStrengths.length > 0 && (
                  <div>
                    <dt className="text-muted">Strong at</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {tutor.teachingStrengths.map((g) => (
                        <Badge key={g} tone={student?.goals.includes(g) ? "pine" : "neutral"}>
                          {goalLabel(g)}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
                {(tutor.interests ?? []).length > 0 && (
                  <div>
                    <dt className="text-muted">Likes</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {(tutor.interests ?? []).map((i) => (
                        <Badge key={i} tone={studentInterests.includes(i) ? "pine" : "neutral"}>
                          {interestLabel(i)}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold">Usually free</h2>
              <p className="mb-3 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                {student ? (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block size-2.5 rounded-sm bg-brass-500" aria-hidden /> both free
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block size-2.5 rounded-sm bg-pine-600" aria-hidden /> {first} free
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block size-2.5 rounded-sm bg-brass-100" aria-hidden /> {isStudent ? "you" : student.first_name} only
                    </span>
                  </>
                ) : (
                  "Eastern time"
                )}
              </p>
              <SlotGrid value={tutor.availability} highlight={student?.availability} readOnly compact />
            </Card>
          </div>
        </div>

        <aside id="book" className="scroll-mt-20 lg:sticky lg:top-8 lg:self-start">
          {students.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted">{isStudent ? "Add your instrument to your music profile to book lessons." : "Add a student with an instrument to request lessons."}</p>
            </Card>
          ) : (
            <RequestLessonForm
              tutor={{
                id: tutor.tutorId,
                name: tutor.displayName,
                sessionMinutes: tutor.sessionMinutes,
                subjects: tutor.subjects.map((s) => ({ id: s.subjectId, slug: s.slug, name: s.name })),
                availability: tutor.availability,
                busy,
              }}
              students={students.map((s) => ({
                id: s.id,
                name: s.first_name,
                consent: consentState(s),
                preferredMinutes: s.preferred_minutes,
                availability: s.availability,
                busy: studentBusy(mine, s.id),
                subjects: s.subjects.map((x) => ({ id: x.subject_id, slug: x.slug, name: x.name })),
              }))}
              initialStudentId={student?.id}
              initialSubjectId={target?.subject_id}
              initialStart={typeof sp.slot === "string" ? sp.slot : undefined}
              canRequest={canRequest}
              isStudent={isStudent}
              threadHref={threadHref}
            />
          )}
          <p className="mt-4 flex gap-2 px-1 text-xs leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Lessons happen on the tutor’s Google Meet — the Join button appears on your Lessons page 15 minutes before the start. Never recorded; a
            parent or guardian stays home or nearby during the lesson.
          </p>
        </aside>
      </div>
      {canRequest && students.length > 0 && <StickyBookBar label={`Book with ${first}`} sub={nextLabel ? `Next open: ${nextLabel}` : "Suggest a time that works"} />}
    </>
  );
}
