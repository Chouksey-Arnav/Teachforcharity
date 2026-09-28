import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info, Music2, School } from "lucide-react";
import { BackLink } from "@/components/dashboard/back-link";
import { requireViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { consentState, getCurrentTutorIds, getFamilyStudents, getTutor, toStudentProfile } from "@/lib/data";
import { matchTutors } from "@/lib/matching";
import { EXPLAIN_STYLES, LEVEL_INFO, TEACHING_STYLES, ensembleLabel, goalLabel } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { SlotGrid } from "@/components/forms/slot-grid";
import { MatchScore } from "@/components/dashboard/tutor-card";
import { RequestLessonForm } from "./request-form";

export const metadata: Metadata = { title: "Tutor profile" };

export default async function TutorProfilePage({ params, searchParams }: PageProps<"/dashboard/tutors/[id]">) {
  const viewer = await requireViewer(["family"]);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const config = await getPublicConfig();
  const tutor = await getTutor(supabase, id);
  if (!tutor) notFound();

  const students = (await getFamilyStudents(supabase, viewer.id, config)).filter((s) => s.subjects.length);
  const student = students.find((s) => s.id === sp.student) ?? students[0];
  const current = student ? await getCurrentTutorIds(supabase, student.id) : [];
  const target = student?.subjects.find((x) => x.subject_id === sp.subject) ?? student?.subjects[0];
  const match = student && target ? matchTutors(toStudentProfile(student, current), target.subject_id, [tutor], { includeRelated: "always" })[0] : undefined;
  const hours = (tutor.verifiedMinutes / 60).toFixed(1).replace(/\.0$/, "");

  return (
    <>
      <BackLink href={`/dashboard/tutors${student ? `?student=${student.id}` : ""}`} label="All tutors" />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar name={tutor.displayName} path={tutor.avatarPath} size={96} />
            <div className="min-w-0 flex-1">
              <h1 className="display text-5xl">{tutor.displayName}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <School className="size-4" /> {tutor.grade ? `${tutor.grade}th grade` : "High school"}
                  {tutor.school ? ` · ${tutor.school}` : ""}
                </span>
                {tutor.county && <span>{tutor.county} County</span>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="neutral">{tutor.lessonsCompleted ? `${tutor.lessonsCompleted} lessons taught` : "New tutor"}</Badge>
                {tutor.verifiedMinutes > 0 && <Badge tone="pine">{hours} verified hours</Badge>}
                {!tutor.acceptingStudents && <Badge tone="brass">Not taking new students</Badge>}
              </div>
            </div>
            {match && <MatchScore score={match.score} tier={match.tier} />}
          </div>

          {tutor.bio && (
            <Card className="p-6">
              <p className="whitespace-pre-line text-[16px] leading-relaxed text-ink-2">{tutor.bio}</p>
            </Card>
          )}

          {match && student && (
            <Card>
              <CardHeader title={`Why ${tutor.displayName.split(" ")[0]} fits ${student.first_name}`} description="How we calculated the match" />
              <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
                <ul className="space-y-2 text-sm text-ink-2">
                  {match.reasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-pine-600" /> {r}
                    </li>
                  ))}
                  {match.cautions.map((r) => (
                    <li key={r} className="flex gap-2 text-muted">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brass-500" /> {r}
                    </li>
                  ))}
                </ul>
                <dl className="space-y-2.5">
                  {(
                    [
                      ["Level fit", match.breakdown.level, 35],
                      ["Shared schedule", match.breakdown.availability, 30],
                      ["Goals", match.breakdown.goals, 15],
                      ["Learning style", match.breakdown.style, 10],
                      ["Open capacity", match.breakdown.capacity, 10],
                    ] as const
                  ).map(([label, v, max]) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs text-muted">
                        <dt>{label}</dt>
                        <dd>
                          {Math.round(v)}/{max}
                        </dd>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-3">
                        <div className="h-full rounded-full bg-pine-600" style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Instruments" description="Self-reported by the tutor — not independently verified." />
            <ul className="divide-y divide-line">
              {tutor.subjects.map((s) => (
                <li key={s.subjectId} className="flex flex-wrap items-start gap-4 px-5 py-4 sm:px-6">
                  <Music2 className="mt-0.5 size-5 text-pine-700" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted">
                      {s.yearsPlaying} year{s.yearsPlaying === 1 ? "" : "s"} · {ensembleLabel(s.topEnsemble)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.teachLevels.map((l) => (
                      <Badge key={l} tone={target && target.subject_id === s.subjectId && target.level === l ? "pine" : "neutral"}>
                        Teaches {LEVEL_INFO[l].label.toLowerCase()}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold">Teaching style</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-muted">Lessons</dt>
                  <dd>{TEACHING_STYLES.find((t) => t.key === tutor.teachingStyle)?.tutor ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Explains by</dt>
                  <dd>{EXPLAIN_STYLES.find((t) => t.key === tutor.explainStyle)?.tutor ?? "—"}</dd>
                </div>
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
                <div>
                  <dt className="text-muted">Lesson lengths</dt>
                  <dd>{tutor.sessionMinutes.join(", ")} minutes</dd>
                </div>
              </dl>
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold">Usually free</h2>
              <p className="mb-3 text-xs text-muted">
                {student ? (
                  <>
                    <span className="mr-1 inline-block size-2.5 rounded-sm bg-brass-500 align-middle" /> both free ·{" "}
                    <span className="mx-1 inline-block size-2.5 rounded-sm bg-pine-600 align-middle" /> tutor free ·{" "}
                    <span className="mx-1 inline-block size-2.5 rounded-sm bg-brass-100 align-middle" /> {student.first_name} only
                  </>
                ) : (
                  "Eastern time"
                )}
              </p>
              <SlotGrid value={tutor.availability} highlight={student?.availability} readOnly compact />
            </Card>
          </div>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          {students.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted">Add a student with an instrument to request lessons.</p>
            </Card>
          ) : (
            <RequestLessonForm
              tutor={{ id: tutor.tutorId, name: tutor.displayName, sessionMinutes: tutor.sessionMinutes, subjects: tutor.subjects.map((s) => ({ id: s.subjectId, slug: s.slug, name: s.name })) }}
              students={students.map((s) => ({
                id: s.id,
                name: s.first_name,
                consent: consentState(s),
                preferredMinutes: s.preferred_minutes,
                subjects: s.subjects.map((x) => ({ id: x.subject_id, slug: x.slug, name: x.name })),
              }))}
              initialStudentId={student?.id}
              initialSubjectId={target?.subject_id}
              canRequest={match ? match.canRequest : tutor.acceptingStudents}
            />
          )}
          <p className="mt-4 flex gap-2 px-1 text-xs leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Lessons happen on the tutor’s Google Meet, never recorded. A parent or guardian must be reachable by phone or text during the lesson.
          </p>
        </aside>
      </div>
    </>
  );
}
