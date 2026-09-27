import Link from "next/link";
import { ArrowRight, CalendarDays, HandHeart, ShieldAlert, Sparkles } from "lucide-react";
import type { Viewer } from "@/lib/viewer";
import { getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getCandidates, getCurrentTutorIds, getFamilyStudents, getMyOffers, getMySessions, relatedSubjectIds, toStudentProfile } from "@/lib/data";
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
import { SetupSteps, type SetupStep } from "@/components/dashboard/setup-steps";
import { GuardianStatus } from "./guardian-status";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, formatRelative } from "@/lib/time";

export async function FamilyHome({ viewer, welcome }: { viewer: Viewer; welcome?: boolean }) {
  const supabase = await createClient();
  const config = await getPublicConfig();
  const isStudent = viewer.profile.account_kind === "student";
  const [students, action, upcoming, history, { data: subjects }, offers, { data: guardian }] = await Promise.all([
    getFamilyStudents(supabase, viewer.id, config?.consent_version),
    getMySessions(supabase, "action"),
    getMySessions(supabase, "upcoming", 5),
    getMySessions(supabase, "all", 50),
    supabase.from("subjects").select("id, slug"),
    getMyOffers(supabase),
    isStudent
      ? supabase.from("guardians").select("name, email, last_invited_at").eq("account_id", viewer.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Top matches for each student's first instrument.
  const matchSets = await Promise.all(
    students
      .filter((s) => s.subjects.length && (s.consent || isStudent))
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
  const needsConsent = isStudent ? [] : students.filter((s) => !s.consent);
  const awaitingParent = isStudent && students.some((s) => !s.consent);
  const deleteOn = formatDate(new Date(new Date(viewer.profile.created_at).getTime() + 14 * 86400000));
  const first = viewer.profile.full_name.split(" ")[0] || "there";
  const scheduledSoon = upcoming.filter((u) => u.status === "scheduled").slice(0, 3);
  const consented = students.length > 0 && students.every((s) => s.consent);
  const requested = history.length > 0;
  const hadLesson = history.some((s) => ["completed", "confirmed", "verified"].includes(s.status));
  const steps: SetupStep[] = isStudent
    ? [
        { label: "Make your music profile", detail: "Tell us your instrument and when you’re free.", done: students.some((s) => s.subjects.length), href: "/dashboard/students", cta: "Finish profile" },
        { label: "Parent approves", detail: "Your parent needs to open the email we sent and say OK. You can resend it above.", done: consented },
        { label: "Request a lesson", detail: "Pick a tutor you like and ask for a time.", done: requested, href: "/dashboard/tutors", cta: "Find tutors" },
        { label: "Have your first lesson", detail: "Join from Lessons when it’s time, then tap “Yes, it happened”.", done: hadLesson, href: "/dashboard/lessons", cta: "See lessons" },
      ]
    : [
        { label: "Add your student", detail: "A short questionnaire about their instrument, level and free times.", done: students.length > 0, href: "/dashboard/students/new", cta: "Add a student" },
        { label: "Sign consent", detail: "Lessons can’t be booked until a parent or guardian signs the consent form.", done: consented, href: "/dashboard/students", cta: "Sign consent" },
        { label: "Request a lesson", detail: "Open a matched tutor and pick a time — they’re emailed right away.", done: requested, href: "/dashboard/tutors", cta: "Find tutors" },
        { label: "First lesson", detail: "After the lesson, confirm it happened so the tutor’s hours count.", done: hadLesson, href: "/dashboard/lessons", cta: "See lessons" },
      ];

  return (
    <>
      <PageHeader eyebrow={greeting()} title={`Hi, ${first}`} description={isStudent ? "Your lessons, tutors, and messages." : "Here’s what’s happening with lessons."} />

      {welcome && (
        <Notice tone="success" className="mb-6" title="You’re all set up!">
          {awaitingParent
            ? "Your profile is ready. Below are tutors who match you best — you can request a lesson as soon as your parent approves."
            : "Your profile is ready. Below are your best tutor matches."}
        </Notice>
      )}

      <SetupSteps title={isStudent ? "Getting started" : "Getting your student started"} steps={steps} />

      {awaitingParent && <GuardianStatus guardian={guardian} deleteOn={deleteOn} />}

      {offers.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <HandHeart className="size-5 text-pine-700" /> Tutors who want to teach {isStudent ? "you" : "your student"}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {offers.slice(0, 4).map((o) => (
              <article key={o.id} className="flex gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
                <Avatar name={o.tutor_name} path={o.tutor_avatar} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <strong>{o.tutor_name}</strong> offered to teach {isStudent ? "you" : o.student_name} {o.subject_name}
                  </p>
                  {o.note && <p className="mt-1 line-clamp-2 text-[13px] text-muted">“{o.note}”</p>}
                  <p className="mt-1 text-xs text-faint">{formatRelative(o.created_at)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <LinkButton href={`/dashboard/tutors/${o.tutor_id}?student=${o.student_id}&subject=${o.subject_id}`} size="sm">
                      View & request
                    </LinkButton>
                    {o.thread_id && (
                      <LinkButton href={`/dashboard/messages/${o.thread_id}`} size="sm" variant="secondary">
                        Message
                      </LinkButton>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

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
                <h2 className="display text-3xl">{isStudent ? "Your top matches" : `Top matches for ${student.first_name}`}</h2>
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
          {isStudent ? (
            <>
              <strong>Stay safe:</strong> keep every message on this site, never share your phone, address, or social media, and have a parent
              nearby during lessons. If anything ever feels weird or uncomfortable,{" "}
              <Link href="/dashboard/report" className="font-medium text-clay-700 underline underline-offset-2">tell us</Link> — you won’t get in trouble.
            </>
          ) : (
            <>
              <strong>During every lesson,</strong> a parent or guardian must be reachable by phone or text. Lessons are never recorded. If anything
              ever feels off, <Link href="/dashboard/report" className="font-medium text-clay-700 underline underline-offset-2">report a concern</Link> right
              away.
            </>
          )}
        </p>
      </section>

      <CauseCard config={config} />
    </>
  );
}
