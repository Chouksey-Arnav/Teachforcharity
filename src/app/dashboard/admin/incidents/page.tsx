import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { INCIDENT_CATEGORIES } from "@/lib/constants";
import { formatWhen } from "@/lib/time";
import { cn } from "@/lib/cn";
import { IncidentControls } from "./incident-controls";

export const metadata: Metadata = { title: "Reports · Admin" };

export default async function AdminIncidentsPage({ searchParams }: PageProps<"/dashboard/admin/incidents">) {
  const sp = await searchParams;
  const filter = sp.status === "resolved" || sp.status === "all" ? sp.status : "unresolved";
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_incidents", { p_status: filter === "all" ? undefined : filter });
  const rows = data ?? [];
  const threadIds = new Map<string, string>();
  const msgIds = rows.map((r) => r.message_id).filter(Boolean) as string[];
  if (msgIds.length) {
    const { data: ms } = await supabase.from("messages").select("id, thread_id").in("id", msgIds);
    ms?.forEach((m) => threadIds.set(m.id, m.thread_id));
  }
  return (
    <>
      <PageHeader title="Reports" description="Review every concern promptly. Safety reports from connected families pause the tutor automatically." />
      <div className="mb-5 flex gap-1">
        {(["unresolved", "resolved", "all"] as const).map((f) => (
          <Link key={f} href={`/dashboard/admin/incidents?status=${f}`} className={cn("rounded-full px-3.5 py-1.5 text-sm capitalize", filter === f ? "bg-ink text-white" : "text-ink-2 hover:bg-paper-2")}>
            {f}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="No reports" />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <article key={r.id} className={cn("rounded-2xl border bg-card", r.category === "safety" && r.status !== "resolved" ? "border-clay-500/40" : "border-line")}>
              <header className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
                <Badge tone={r.category === "safety" ? "clay" : "brass"}>{INCIDENT_CATEGORIES.find((c) => c.key === r.category)?.label ?? r.category}</Badge>
                <Badge tone={r.status === "resolved" ? "pine" : "neutral"}>{r.status}</Badge>
                {r.tutor_auto_paused && <Badge tone="clay">Tutor auto-paused</Badge>}
                <span className="ml-auto text-xs text-muted">{formatWhen(r.created_at)}</span>
              </header>
              <div className="grid gap-5 px-5 py-4 text-sm md:grid-cols-[1.4fr_1fr]">
                <div>
                  <p className="whitespace-pre-wrap leading-relaxed text-ink-2">{r.description}</p>
                  {r.message_body && (
                    <blockquote className="mt-3 rounded-lg border-l-2 border-clay-500 bg-paper-2 px-3 py-2 text-ink-2">
                      “{r.message_body}”
                      {r.message_id && threadIds.get(r.message_id) && (
                        <Link href={`/dashboard/admin/threads/${threadIds.get(r.message_id)}`} className="mt-1 block text-xs text-pine-700 underline">
                          Open full conversation
                        </Link>
                      )}
                    </blockquote>
                  )}
                </div>
                <dl className="space-y-1.5">
                  <div><dt className="text-xs text-muted">Reported by</dt><dd>{r.reporter_name ?? "—"} ({r.reporter_role}) · {r.reporter_email}</dd></div>
                  <div><dt className="text-xs text-muted">Tutor</dt><dd>{r.tutor_name ? `${r.tutor_name} — ${r.tutor_status}` : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Student</dt><dd>{r.student_name ?? "—"}</dd></div>
                  {r.session_start && <div><dt className="text-xs text-muted">Lesson</dt><dd>{formatWhen(r.session_start)}</dd></div>}
                </dl>
              </div>
              <IncidentControls id={r.id} status={r.status} notes={r.admin_notes ?? ""} tutorId={r.tutor_id} tutorStatus={r.tutor_status} messageId={r.message_id} />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
