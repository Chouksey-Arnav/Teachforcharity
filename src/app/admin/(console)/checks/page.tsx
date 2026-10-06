import type { Metadata } from "next";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, PersonLink, Tabs, ago, when } from "@/components/admin/ui";
import { RunChecksButton } from "@/components/admin/flag-actions";
import { TutorActions } from "@/components/admin/tutor-actions";
import { Badge } from "@/components/ui/badge";
import type { Check } from "@/lib/verification/pipeline";

export const metadata: Metadata = { title: "Account checks" };

const DECISION: Record<string, { label: string; tone: "pine" | "brass" | "clay" }> = {
  verified: { label: "Verified", tone: "pine" },
  review: { label: "Needs a look", tone: "brass" },
  blocked: { label: "Blocked", tone: "clay" },
};
const STAGE: Record<string, string> = { identity: "Identity", profile: "Profile", messages: "Messages", conduct: "Conduct", attendance: "Attendance" };

export default async function ChecksPage({ searchParams }: PageProps<"/admin/checks">) {
  const sp = await searchParams;
  const view = sp.view === "verified" || sp.view === "all" ? sp.view : sp.view === "blocked" ? "blocked" : "review";
  const db = await adminDb();
  const { data } = await db.rpc("admin_account_checks", { p_decision: view === "all" ? undefined : view, p_limit: 300 });
  const rows = data ?? [];

  return (
    <AdminPage
      title="Account checks"
      description="Every tutor account is checked automatically: when they sign up, when they change their profile, hourly while they wait, and every account once a day. The check reads their names, parent details, bio and every message from the last 30 days, plus open flags, reports and attendance. Verified tutors go live on their own. Only exceptions land here. Making a tutor live clears the findings shown, so the daily check won't raise them again."
      actions={<RunChecksButton />}
    >
      <Tabs
        active={view}
        items={[
          { key: "review", label: "Needs a look", href: "/admin/checks" },
          { key: "blocked", label: "Blocked", href: "/admin/checks?view=blocked" },
          { key: "verified", label: "Verified", href: "/admin/checks?view=verified" },
          { key: "all", label: "All", href: "/admin/checks?view=all" },
        ]}
      />
      {!rows.length ? (
        <Empty>{view === "review" || view === "blocked" ? "Nothing to look at. Every checked tutor passed." : "No results yet."}</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const checks = (Array.isArray(r.checks) ? r.checks : []) as unknown as Check[];
            const problems = checks.filter((c) => c.outcome !== "pass").sort((a, b) => b.points - a.points);
            const d = DECISION[r.effective_decision] ?? DECISION.review;
            return (
              <article key={r.tutor_id} className={r.effective_decision === "blocked" ? "rounded-xl border border-clay-500/40 bg-card" : "rounded-xl border border-line bg-card"}>
                <div className="space-y-2 px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={d.tone} dot>
                      {d.label}
                    </Badge>
                    <PersonLink id={r.tutor_id} name={r.tutor_name} kind="tutor" />
                    <Badge tone="neutral">tutor {r.tutor_status}</Badge>
                    <span className="font-mono text-xs text-muted">risk {r.risk}/100</span>
                    {r.decision !== r.effective_decision && <Badge tone="neutral">cleared by an admin</Badge>}
                    {r.action && <Badge tone="clay">{r.action.replace(/_/g, " ")}</Badge>}
                    <span className="text-xs text-muted">
                      {when(r.created_at)} ({ago(r.created_at)}) · {r.source}
                    </span>
                  </div>
                  {problems.length ? (
                    <ul className="space-y-1.5">
                      {problems.map((c) => (
                        <li key={c.id} className="rounded-lg bg-paper px-3 py-2 text-sm">
                          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{STAGE[c.stage] ?? c.stage}</span>{" "}
                          <Badge tone={c.outcome === "fail" ? "clay" : "brass"}>{c.hard ? "blocking" : c.outcome}</Badge>{" "}
                          <span className="text-ink-2">{c.detail}</span>
                          {c.evidence?.length ? <span className="mt-1 block text-xs text-muted">{c.evidence.map((e) => `“${e}”`).join("  ·  ")}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Every check passed.</p>
                  )}
                </div>
                {r.tutor_status !== "removed" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper/60 px-4 py-2.5">
                    <TutorActions tutorId={r.tutor_id} status={r.tutor_status} onboarded />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}
