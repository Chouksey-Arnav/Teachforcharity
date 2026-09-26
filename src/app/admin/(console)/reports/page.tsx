import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, PersonLink, StatusBadge, Tabs, ago, when } from "@/components/admin/ui";
import { IncidentControls } from "@/components/admin/incident-controls";
import { Badge } from "@/components/ui/badge";
import { INCIDENT_CATEGORIES } from "@/lib/constants";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const sp = await searchParams;
  const view = sp.view === "all" || sp.view === "resolved" ? sp.view : "unresolved";
  const db = await adminDb();
  const { data } = await db.rpc("admin_list_incidents", { p_status: view === "all" ? undefined : view });
  const rows = data ?? [];

  return (
    <AdminPage
      title="Reports"
      description="Concerns filed by students, parents (including from their private link), and tutors. A safety report about a tutor pauses them automatically."
    >
      <Tabs
        active={view}
        items={[
          { key: "unresolved", label: "Open", href: "/admin/reports" },
          { key: "resolved", label: "Resolved", href: "/admin/reports?view=resolved" },
          { key: "all", label: "All", href: "/admin/reports?view=all" },
        ]}
      />
      {!rows.length ? (
        <Empty>{view === "unresolved" ? "No open reports. 🎉" : "No reports."}</Empty>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const cat = INCIDENT_CATEGORIES.find((c) => c.key === r.category)?.label ?? r.category;
            return (
              <article key={r.id} className="overflow-hidden rounded-xl border border-line bg-card">
                <div className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.category === "safety" ? <Badge tone="clay" dot>Safety</Badge> : <Badge tone="neutral">{cat}</Badge>}
                    <StatusBadge status={r.status} />
                    {r.tutor_auto_paused && <Badge tone="clay">Tutor auto-paused</Badge>}
                    <span className="text-xs text-muted">
                      {when(r.created_at)} ({ago(r.created_at)})
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink">{r.description}</p>
                  <div className="grid gap-1 text-[13px] text-muted sm:grid-cols-2">
                    <p>
                      From:{" "}
                      {r.reporter_id ? <PersonLink id={r.reporter_id} name={r.reporter_name} kind={r.reporter_role} /> : <span>{r.reporter_label ?? "Unknown"}</span>}
                      {r.reporter_email && <span> · {r.reporter_email}</span>}
                    </p>
                    {r.tutor_id && (
                      <p>
                        About tutor: <PersonLink id={r.tutor_id} name={r.tutor_name} /> {r.tutor_status && <StatusBadge status={r.tutor_status} />}
                      </p>
                    )}
                    {r.student_name && (
                      <p>
                        Student: <PersonLink id={r.student_family_id} name={r.student_name} />
                      </p>
                    )}
                    {r.session_start && <p>Lesson: {when(r.session_start)}</p>}
                  </div>
                  {r.message_body && (
                    <blockquote className="rounded-lg border-l-4 border-clay-500/50 bg-paper px-3 py-2 text-[13px] text-ink-2">
                      “{r.message_body}”{" "}
                      {r.thread_id && (
                        <Link href={`/admin/messages/${r.thread_id}`} className="text-pine-700 hover:underline">
                          Open conversation
                        </Link>
                      )}
                    </blockquote>
                  )}
                </div>
                <IncidentControls id={r.id} status={r.status} notes={r.admin_notes ?? ""} tutorId={r.tutor_id} tutorStatus={r.tutor_status} messageId={r.message_id} />
              </article>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}
