import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Panel, PersonLink, SeverityBadge, Stat, actionLabel, ago } from "@/components/admin/ui";
import { WeekBars } from "@/components/admin/week-bars";
import { CATEGORY_LABEL } from "@/lib/safety/lexicon";

export const metadata: Metadata = { title: "Overview" };

type Overview = {
  people: Record<string, number> | null;
  signups_7d: number;
  tutors: Record<string, number> | null;
  tutors_onboarding: number;
  students: number;
  students_with_consent: number;
  students_awaiting_parent: number;
  sessions: Record<string, number> | null;
  lessons_this_week: number;
  verified_minutes: number;
  awaiting_verification: number;
  disputed: number;
  open_incidents: number;
  open_flags: Record<string, number> | null;
  messages_7d: number;
  emails_failed: number;
  emails_queued: number;
  alert_recipients: number;
  weekly: { week: string; signups: number; lessons: number }[];
  waiting_instruments: { name: string; students: number }[];
};

export default async function AdminOverview() {
  const db = await adminDb();
  const [{ data: o }, { data: flags }, { data: activity }, { data: health }, { count: calls }] = await Promise.all([
    db.rpc("admin_overview"),
    db.rpc("admin_list_flags", { p_status: "open", p_limit: 5 }),
    db.rpc("admin_activity", { p_limit: 12 }),
    db.rpc("admin_health"),
    db.from("consents").select("id", { count: "exact", head: true }).eq("verification_status", "pending").is("revoked_at", null),
  ]);
  const ov = o as unknown as Overview;
  const h = health as unknown as { jobs: { name: string; active: boolean }[]; unscanned_messages: number; last_moderation: { started_at: string } | null };
  const people = ov.people ?? {};
  const flagCount = ov.open_flags ?? {};
  const urgent = (flagCount.critical ?? 0) + (flagCount.high ?? 0);
  const hrs = (ov.verified_minutes / 60).toFixed(1).replace(/\.0$/, "");

  const attention: { text: string; href: string; tone: "danger" | "warn" }[] = [];
  if (ov.alert_recipients === 0) attention.push({ text: "Nobody receives safety alerts — add alert emails", href: "/admin/settings", tone: "danger" });
  if (urgent) attention.push({ text: `${urgent} high/critical safety flag${urgent === 1 ? "" : "s"} to review`, href: "/admin/safety", tone: "danger" });
  if (calls) attention.push({ text: `${calls} parent${calls === 1 ? "" : "s"} waiting for a check (call or signed form)`, href: "/admin/consents", tone: "danger" });
  if (ov.open_incidents) attention.push({ text: `${ov.open_incidents} open report${ov.open_incidents === 1 ? "" : "s"}`, href: "/admin/reports", tone: "danger" });
  if (ov.disputed) attention.push({ text: `${ov.disputed} disputed lesson${ov.disputed === 1 ? "" : "s"}`, href: "/admin/lessons?status=disputed", tone: "warn" });
  if (ov.awaiting_verification) attention.push({ text: `${ov.awaiting_verification} confirmed lesson${ov.awaiting_verification === 1 ? "" : "s"} waiting for hour verification`, href: "/admin/lessons?status=confirmed", tone: "warn" });
  if (ov.emails_failed) attention.push({ text: `${ov.emails_failed} email${ov.emails_failed === 1 ? "" : "s"} failed to send`, href: "/admin/emails?status=failed", tone: "warn" });
  if (!h.jobs.some((j) => j.name === "tfac-email-drain" && j.active)) attention.push({ text: "Email delivery job isn’t scheduled — reminders only go out once a day", href: "/admin/settings#health", tone: "warn" });

  return (
    <AdminPage title="Overview" description="Everything happening in the program, live from the database. Refreshes every 30 seconds.">
      {attention.length > 0 && (
        <Panel title={<span className="flex items-center gap-2"><CircleAlert className="size-4 text-clay-700" /> Needs attention</span>} className="mb-6" flush>
          <ul className="divide-y divide-line">
            {attention.map((a) => (
              <li key={a.text}>
                <Link href={a.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-paper">
                  <span className="flex items-center gap-2">
                    <span className={a.tone === "danger" ? "size-2 shrink-0 rounded-full bg-clay-700" : "size-2 shrink-0 rounded-full bg-brass-500"} />
                    {a.text}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Students" value={people.student ?? 0} hint={`${ov.students_awaiting_parent} awaiting a parent`} href="/admin/people?kind=student" />
        <Stat label="Parents" value={people.parent ?? 0} hint={`${ov.students_with_consent} students with consent`} href="/admin/people?kind=parent" />
        <Stat label="Active tutors" value={ov.tutors?.active ?? 0} hint={`${ov.tutors?.paused ?? 0} paused · ${ov.tutors_onboarding} signing up`} href="/admin/people?kind=tutor" />
        <Stat label="New sign-ups" value={ov.signups_7d} hint="last 7 days" href="/admin/activity?action=account" />
        <Stat label="Lessons this week" value={ov.lessons_this_week} hint={`${ov.sessions?.pending ?? 0} requests pending`} href="/admin/lessons" />
        <Stat label="Verified hours" value={hrs} hint="all time" href="/admin/lessons?status=verified" />
        <Stat label="Open reports" value={ov.open_incidents} tone={ov.open_incidents ? "danger" : "neutral"} href="/admin/reports" />
        <Stat label="Safety flags" value={Object.values(flagCount).reduce((a, b) => a + b, 0)} hint={`${urgent} high or critical`} tone={urgent ? "danger" : "neutral"} href="/admin/safety" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Last 12 weeks">
          <div className="grid gap-6 sm:grid-cols-2">
            <WeekBars title="Sign-ups" data={ov.weekly.map((w) => ({ week: w.week, value: w.signups }))} />
            <WeekBars title="Lessons booked" data={ov.weekly.map((w) => ({ week: w.week, value: w.lessons }))} color="var(--color-brass-600)" />
          </div>
          <p className="mt-4 text-xs text-muted">
            {ov.messages_7d} messages in the last 7 days · last safety scan {ago(h.last_moderation?.started_at)} · {h.unscanned_messages} waiting to be scanned
          </p>
        </Panel>

        <Panel title="Instruments with no tutor yet">
          {ov.waiting_instruments.length ? (
            <ul className="space-y-2 text-sm">
              {ov.waiting_instruments.map((w) => (
                <li key={w.name} className="flex justify-between gap-3">
                  <span>{w.name}</span>
                  <span className="tabular-nums text-muted">
                    {w.students} student{w.students === 1 ? "" : "s"} waiting
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Every student’s instrument has at least one active tutor. 🎉</p>
          )}
          <p className="mt-3 text-xs text-muted">Recruit tutors for these first.</p>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Open safety flags" action={<Link href="/admin/safety" className="text-xs text-pine-700 hover:underline">All flags</Link>} flush>
          {flags?.length ? (
            <ul className="divide-y divide-line">
              {flags.map((f) => (
                <li key={f.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="font-medium">{CATEGORY_LABEL[f.category as keyof typeof CATEGORY_LABEL] ?? f.category}</span>
                    <span className="text-xs text-muted">{ago(f.created_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{f.excerpt}</p>
                  <p className="mt-1 text-xs text-muted">
                    by <PersonLink id={f.author_id} name={f.author_name} kind={f.author_kind} />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">No open flags.</p>
          )}
        </Panel>

        <Panel title="Recent activity" action={<Link href="/admin/activity" className="text-xs text-pine-700 hover:underline">Full log</Link>} flush>
          <ul className="divide-y divide-line">
            {(activity ?? []).map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{actionLabel(a.action)}</p>
                  <p className="truncate text-xs text-muted">{a.actor_name ? <PersonLink id={a.actor_id} name={a.actor_name} kind={a.actor_kind} /> : "System / admin"}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">{ago(a.created_at)}</span>
              </li>
            ))}
            {!activity?.length && <li className="p-4 text-sm text-muted">Nothing yet.</li>}
          </ul>
        </Panel>
      </div>
    </AdminPage>
  );
}
