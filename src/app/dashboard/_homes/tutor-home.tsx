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
  const [action, upcoming, all] = await Promise.all([getMySessions(supabase, "action"), getMySessions(supabase, "upcoming", 5), getMySessions(supabase, "all", 500)]);
  const t = viewer.tutor!;
  const sum = (st: string[]) => all.filter((s) => st.includes(s.status)).reduce((a, s) => a + s.duration_minutes, 0);
  const verified = sum(["verified"]);
  const pendingV = sum(["completed", "confirmed"]);
  const activeStudents = new Set(
    all.filter((s) => ["pending", "scheduled", "completed", "confirmed", "verified"].includes(s.status) && new Date(s.start_at).getTime() > Date.now() - 45 * 86400000).map((s) => s.student_id),
  ).size;
  const first = viewer.profile.full_name.split(" ")[0] || "there";
  const has = (st: string[]) => all.some((s) => st.includes(s.status));
  const steps: SetupStep[] = [
    { label: "Add a photo & intro", detail: "Families are far more likely to pick a tutor with a photo and a short intro.", done: Boolean(viewer.profile.avatar_path && t.bio), href: "/dashboard/profile", cta: "Edit profile" },
    { label: "Parent approves", detail: "Your parent or guardian approves from the email we sent them.", done: Boolean(t.guardian_approved_at) },
    { label: "Profile goes live", detail: "The program team reviews your profile — we’ll email you when families can see you.", done: t.status === "active" },
    { label: "Book a first lesson", detail: "Offer to teach a matched student, or accept a request under Lessons.", done: has(["scheduled", "completed", "confirmed", "verified", "disputed", "rejected"]), href: "/dashboard/find-students", cta: "Find students" },
    { label: "Log it afterward", detail: "After a lesson ends, open Lessons and log it so the family can confirm.", done: has(["completed", "confirmed", "verified", "disputed", "rejected"]), href: "/dashboard/lessons", cta: "Open lessons" },
    { label: "Hours verified", detail: "Once the family confirms, the partner nonprofit verifies your hours each week.", done: has(["verified"]), href: "/dashboard/hours", cta: "See hours" },
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
      {t.status === "pending" && t.guardian_approved_at && (
        <Notice tone="info" className="mb-6" title="Your profile is being reviewed">
          The program team reviews every tutor before families can see them — usually within a couple of days. We’ll email you when you’re approved.
          Meanwhile, you can polish your <Link href="/dashboard/profile" className="underline underline-offset-2">profile</Link>.
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

      {(t.status === "active" || t.status === "pending") && <SetupSteps title="Getting started as a tutor" steps={steps} />}

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat href="/dashboard/hours" icon={Clock3} label="Verified hours" value={hrs(verified)} hint="Your hours record" />
        <Stat href="/dashboard/lessons?tab=history" icon={Hourglass} label="Awaiting verification" value={hrs(pendingV)} hint="Logged or confirmed" />
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
