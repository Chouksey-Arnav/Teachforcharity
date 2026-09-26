import Link from "next/link";
import { CalendarDays, Clock3, Hourglass, PauseCircle, UserRound, Users } from "lucide-react";
import type { Viewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMySessions } from "@/lib/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { LessonCard } from "@/components/dashboard/lesson-card";
import { AcceptingToggle } from "@/components/dashboard/accepting-toggle";
import { Notice } from "@/components/ui/notice";
import { LinkButton } from "@/components/ui/button";
import { greeting } from "./greeting";

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Clock3; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <Icon className="size-5 text-pine-700" strokeWidth={1.8} />
      <p className="display mt-3 text-4xl">{value}</p>
      <p className="mt-1 text-sm text-ink-2">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
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

  return (
    <>
      <PageHeader
        eyebrow={greeting()}
        title={`Hi, ${first}`}
        description="Your requests, lessons, and hours."
        actions={t.status === "active" ? <AcceptingToggle accepting={t.accepting_students} /> : undefined}
      />
      {passwordUpdated && <Notice tone="success" className="mb-6">Your password was updated.</Notice>}
      {t.status === "pending" && (
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

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/dashboard/hours" className="rounded-2xl transition hover:shadow-lift">
          <Stat icon={Clock3} label="Verified hours" value={hrs(verified)} hint="Tap for your hours record" />
        </Link>
        <Stat icon={Hourglass} label="Awaiting verification" value={hrs(pendingV)} hint="Logged or confirmed" />
        <Stat icon={Users} label="Active students" value={`${activeStudents}/${t.max_students}`} hint="Your limit" />
        <Stat icon={CalendarDays} label="Upcoming lessons" value={String(upcoming.filter((u) => u.status === "scheduled").length)} />
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
            <Link href="/dashboard/lessons?tab=action" className="text-sm text-pine-700 hover:underline">
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

      {(!viewer.profile.avatar_path || !t.bio) && (
        <section className="rounded-2xl border border-line bg-card p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 size-5 text-pine-700" />
            <div>
              <p className="font-medium">Students are more likely to request tutors with a photo and a short intro.</p>
              <p className="text-sm text-muted">It takes a minute.</p>
            </div>
          </div>
          <LinkButton href="/dashboard/profile" variant="secondary" size="sm" className="mt-3 sm:mt-0">
            Finish profile
          </LinkButton>
        </section>
      )}
      <p className="mt-10 flex items-center gap-2 text-xs text-muted">
        <PauseCircle className="size-4" /> Need a break? Turn off “Accepting new students” — your current students can still book with you.
      </p>
    </>
  );
}
