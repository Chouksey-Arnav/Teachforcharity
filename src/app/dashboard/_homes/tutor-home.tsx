import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3, Hourglass, PauseCircle, Users } from "lucide-react";
import type { Viewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMySessions } from "@/lib/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { LessonCard } from "@/components/dashboard/lesson-card";
import { AcceptingToggle } from "@/components/dashboard/accepting-toggle";
import { Notice } from "@/components/ui/notice";
import { TutorGuardianStatus } from "./tutor-guardian-status";
import { AccountCheckPanel, type CheckStatus } from "./account-check-panel";
import { LinkButton } from "@/components/ui/button";
import { greeting } from "./greeting";
import { SetupSteps, type SetupStep } from "@/components/dashboard/setup-steps";

function Stat({ icon: Icon, label, value, hint, href }: { icon: typeof Clock3; label: string; value: string; hint?: string; href: string }) {
  return (
    <Link href={href} className="group block rounded-2xl border border-line bg-card p-5 transition hover:border-line-2 hover:shadow-lift">
      <span className="flex items-center justify-between">
        <Icon className="size-5 text-pine-700" strokeWidth={1.8} />
        <ArrowUpRight className="size-4 text-faint opacity-0 transition group-hover:opacity-100" />
      </span>
      <p className="display mt-3 text-4xl">{value}</p>
      <p className="mt-1 text-sm text-ink-2">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Link>
  );
}

const hrs = (m: number) => (m / 60).toFixed(1).replace(/\.0$/, "");

export async function TutorHome({ viewer, passwordUpdated }: { viewer: Viewer; passwordUpdated?: boolean }) {
  const supabase = await createClient();
  const [action, upcoming, all, { data: checkData }] = await Promise.all([
    getMySessions(supabase, "action"),
    getMySessions(supabase, "upcoming", 5),
    getMySessions(supabase, "all", 500),
    supabase.rpc("my_account_check"),
  ]);
  const check = checkData as { status: string; checked_at: string | null; hints: string[] } | null;
  const hints = check?.hints ?? [];
  const t = viewer.tutor!;
  const sum = (st: string[]) => all.filter((s) => st.includes(s.status)).reduce((a, s) => a + s.duration_minutes, 0);
  // Two-step hours: the student verifies attendance, then the partner nonprofit certifies.
  const certified = sum(["verified"]);
  const studentVerified = sum(["confirmed", "verified"]);
  const awaitingStudent = sum(["completed"]);
  const activeStudents = new Set(
    all.filter((s) => ["pending", "scheduled", "completed", "confirmed", "verified"].includes(s.status) && new Date(s.start_at).getTime() > Date.now() - 45 * 86400000).map((s) => s.student_id),
  ).size;
  const first = viewer.profile.full_name.split(" ")[0] || "there";
  const has = (st: string[]) => all.some((s) => st.includes(s.status));
  const profileDone = Boolean(viewer.profile.avatar_path && t.bio);
  const profileNudge = profileDone ? {} : { href: "/dashboard/profile", cta: "Add a photo & intro" };
  // Where a new tutor stands, in the order it happens. Each step says who it's waiting on.
  const steps: SetupStep[] = [
    { label: "Account made", detail: "", done: true },
    {
      label: "Parent approves",
      detail: `Your parent approves from the email we sent them.${profileDone ? "" : " While you wait, add a photo and a short intro: families pick tutors with both far more often."}`,
      done: Boolean(t.guardian_approved_at),
      ...profileNudge,
    },
    {
      label: "Account check",
      detail: "Our automated account check reviews your profile, usually within minutes of your parent’s OK. Anything it can’t clear goes to a person on the team.",
      done: t.status === "active" || check?.status === "verified",
      ...profileNudge,
    },
    {
      label: "Visible to families",
      detail: t.status === "active" ? "You’ve paused new students. Turn “Taking new students” back on so matched families can find you." : "We’ll email you the moment families matched to your instruments can see you.",
      done: t.status === "active" && t.accepting_students,
    },
    { label: "First lesson", detail: "Offer to teach a matched student, or accept a request under Lessons. Log it truthfully once it’s over.", done: has(["completed", "confirmed", "verified", "disputed", "rejected"]), href: "/dashboard/find-students", cta: "Find students" },
    { label: "Hours verified", detail: "Your student confirms you were there, then the partner nonprofit reviews the hours each week.", done: has(["confirmed", "verified"]), href: "/dashboard/hours", cta: "See hours" },
  ];


  return (
    <>
      <PageHeader
        eyebrow={greeting()}
        title={`Hi, ${first}`}
        description="Your requests, lessons, and hours."
        actions={t.status === "active" ? <AcceptingToggle accepting={t.accepting_students} /> : undefined}
      />
      {passwordUpdated && <Notice tone="success" className="mb-6">Your password was updated.</Notice>}
      {t.status === "pending" && !t.guardian_approved_at && (
        <TutorGuardianStatus guardianName={t.guardian_name ?? ""} guardianEmail={t.guardian_email ?? ""} lastSent={t.guardian_last_invited_at} />
      )}
      {((t.status === "pending" && t.guardian_approved_at) || t.status === "active") && (
        <AccountCheckPanel status={(check?.status as CheckStatus | undefined) ?? null} checkedAt={check?.checked_at ?? null} hints={hints} live={t.status === "active"} />
      )}
      {t.status === "active" && hints.length > 0 && (
        <Notice tone="info" className="mb-6" title="Make your profile stronger">
          <ul className="list-disc space-y-0.5 pl-5">
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Notice>
      )}
      {t.status === "paused" && (
        <Notice tone="warning" className="mb-6" title="Your profile is paused">
          Families can’t see you or request lessons right now{t.status_reason ? `: ${t.status_reason}` : "."} The program team will be in touch.
        </Notice>
      )}
      {t.status === "removed" && (
        <Notice tone="danger" className="mb-6" title="Your tutor profile is no longer active">
          If you believe this is a mistake, please contact the program administrator.
        </Notice>
      )}

      {(t.status === "active" || t.status === "pending") && <SetupSteps title="Where you are" steps={steps} />}

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat href="/dashboard/hours" icon={Clock3} label="Student-verified hours" value={hrs(studentVerified)} hint={`${hrs(certified)} certified by the partner`} />
        <Stat href="/dashboard/lessons?tab=history" icon={Hourglass} label="Awaiting student check-in" value={hrs(awaitingStudent)} hint="Logged, not yet confirmed" />
        <Stat href="/dashboard/lessons?tab=upcoming" icon={Users} label="Active students" value={`${activeStudents}/${t.max_students}`} hint="Change your limit in Profile" />
        <Stat href="/dashboard/lessons?tab=upcoming" icon={CalendarDays} label="Upcoming lessons" value={String(upcoming.filter((u) => u.status === "scheduled").length)} hint="See your schedule" />
      </div>

      {t.status === "active" && (
        <section className="mb-10 flex flex-col gap-4 rounded-2xl border border-pine-200 bg-pine-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-pine-900">Find students who fit you</p>
            <p className="text-sm text-pine-800/80">See students matched to your instruments, levels, and schedule — and offer to teach them.</p>
          </div>
          <LinkButton href="/dashboard/find-students" size="sm">
            Find students
          </LinkButton>
        </section>
      )}

      {action.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="size-2 rounded-full bg-brass-500" /> Needs your attention
            </h2>
            <Link href="/dashboard/lessons?tab=action" className="text-sm text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
              See all
            </Link>
          </div>
          <div className="grid gap-4">
            {action.slice(0, 4).map((s) => (
              <LessonCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Coming up</h2>
        {upcoming.filter((u) => u.status === "scheduled").length ? (
          <div className="grid gap-4">
            {upcoming
              .filter((u) => u.status === "scheduled")
              .slice(0, 3)
              .map((s) => (
                <LessonCard key={s.id} s={s} />
              ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-2 px-5 py-6 text-sm text-muted">
            {t.status === "active" ? "No lessons booked yet. When a student requests a time, you’ll get an email." : "Lessons will appear here once your profile is active."}
          </div>
        )}
      </section>

      <p className="mt-10 flex items-center gap-2 text-xs text-muted">
        <PauseCircle className="size-4" /> Need a break? Turn off “Accepting new students” — your current students can still book with you.
      </p>
    </>
  );
}
