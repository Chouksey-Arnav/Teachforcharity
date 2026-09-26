import Link from "next/link";
import { ArrowRight, CalendarDays, ShieldAlert, Sparkles } from "lucide-react";
import type { Viewer } from "@/lib/viewer";
import { getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getCandidates, getCurrentTutorIds, getFamilyStudents, getMySessions, relatedSubjectIds, toStudentProfile } from "@/lib/data";
import { matchTutors } from "@/lib/matching";
import { LEVEL_INFO } from "@/lib/constants";
import { PageHeader } from "@/components/dashboard/page-header";
import { LessonCard } from "@/components/dashboard/lesson-card";
import { TutorCard } from "@/components/dashboard/tutor-card";
import { CauseCard } from "@/components/site/sections";
import { Notice } from "@/components/ui/notice";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";
import { greeting } from "./greeting";

export async function FamilyHome({ viewer }: { viewer: Viewer }) {
  const supabase = await createClient();
  const config = await getPublicConfig();
  const [students, action, upcoming, { data: subjects }] = await Promise.all([
    getFamilyStudents(supabase, viewer.id, config?.consent_version),
    getMySessions(supabase, "action"),
    getMySessions(supabase, "upcoming", 5),
    supabase.from("subjects").select("id, slug"),
  ]);

  // Top matches for each student's first instrument.
  const matchSets = await Promise.all(
    students
      .filter((s) => s.subjects.length && s.consent)
      .slice(0, 3)
      .map(async (s) => {
        const target = s.subjects[0];
        const [cands, current] = await Promise.all([
          getCandidates(supabase, relatedSubjectIds(target.slug, subjects ?? [])),
          getCurrentTutorIds(supabase, s.id),
        ]);
        const matches = matchTutors(toStudentProfile(s, current), target.subject_id, cands).filter((m) => m.canRequest).slice(0, 3);
        return { student: s, target, matches: matches.map((m) => ({ m, t: cands.find((c) => c.tutorId === m.tutorId)! })) };
      }),
  );
  const needsConsent = students.filter((s) => !s.consent);
  const first = viewer.profile.full_name.split(" ")[0] || "there";
  const scheduledSoon = upcoming.filter((u) => u.status === "scheduled").slice(0, 3);

  return (
    <>
      <PageHeader eyebrow={greeting()} title={`Hi, ${first}`} description="Here’s what’s happening with lessons." />

      {needsConsent.length > 0 && (
        <Notice
          tone="warning"
          className="mb-6"
          title={`Consent needed for ${needsConsent.map((s) => s.first_name).join(" and ")}`}
          action={<LinkButton href="/dashboard/students" size="sm" variant="secondary">Sign now</LinkButton>}
        >
          Lessons can’t be requested until a parent or guardian signs the consent form.
        </Notice>
      )}

      {action.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="size-2 rounded-full bg-brass-500" /> Needs your attention
            </h2>
            <Link href="/dashboard/lessons?tab=action" className="text-sm text-pine-700 hover:underline">
              See all
            </Link>
          </div>
          <div className="grid gap-4">
            {action.slice(0, 3).map((s) => (
              <LessonCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      {students.length === 0 ? (
        <Empty icon={<Sparkles className="size-5" />} title="Add your student" action={<LinkButton href="/dashboard/students/new">Add a student</LinkButton>}>
          Tell us about your middle schooler to see their tutor matches.
        </Empty>
      ) : (
        matchSets.map(({ student, target, matches }) => (
          <section key={student.id} className="mb-10">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="display text-3xl">Top matches for {student.first_name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {target.name} · {LEVEL_INFO[target.level].label}
                  {student.subjects.length > 1 && ` · plus ${student.subjects.length - 1} more instrument${student.subjects.length > 2 ? "s" : ""}`}
                </p>
              </div>
              <LinkButton href={`/dashboard/tutors?student=${student.id}`} variant="ghost" size="sm">
                All matches <ArrowRight className="size-4" />
              </LinkButton>
            </div>
            {matches.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {matches.map(({ m, t }) => (
                  <TutorCard key={t.tutorId} tutor={t} match={m} studentName={student.first_name} href={`/dashboard/tutors/${t.tutorId}?student=${student.id}&subject=${target.subject_id}`} />
                ))}
              </div>
            ) : (
              <Notice tone="info" title={`No ${target.name.toLowerCase()} tutors are available yet`}>
                New tutors join regularly, and the program team can see which instruments families are waiting on. Check back soon — we’ll show matches here the moment one is available.
              </Notice>
            )}
          </section>
        ))
      )}

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Coming up</h2>
          <Link href="/dashboard/lessons?tab=upcoming" className="text-sm text-pine-700 hover:underline">
            All lessons
          </Link>
        </div>
        {scheduledSoon.length ? (
          <div className="grid gap-4">
            {scheduledSoon.map((s) => (
              <LessonCard key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line-2 px-5 py-6 text-sm text-muted">
            <CalendarDays className="size-5 text-faint" /> No lessons booked yet. Request a time from any tutor’s profile.
          </div>
        )}
      </section>

      <section className="mb-10 rounded-2xl border border-line bg-card p-5 sm:flex sm:items-center sm:gap-5">
        <ShieldAlert className="size-6 shrink-0 text-clay-700" />
        <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2 sm:mt-0">
          <strong>During every lesson,</strong> a parent or guardian must be reachable by phone or text. Lessons are never recorded. If anything
          ever feels off, <Link href="/dashboard/report" className="font-medium text-clay-700 underline underline-offset-2">report a concern</Link> right away.
        </p>
      </section>

      <CauseCard config={config} />
    </>
  );
}
