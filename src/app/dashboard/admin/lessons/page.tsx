import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge, sessionTone } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { SESSION_STATUS_LABEL } from "@/lib/constants";
import { formatWhen } from "@/lib/time";
import { cn } from "@/lib/cn";
import { DisputeActions } from "./dispute-actions";

export const metadata: Metadata = { title: "Lessons · Admin" };

const FILTERS = ["all", "disputed", "pending", "scheduled", "completed", "confirmed", "verified", "rejected", "cancelled", "expired"];

export default async function AdminLessonsPage({ searchParams }: PageProps<"/dashboard/admin/lessons">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && FILTERS.includes(sp.status) ? sp.status : "all";
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_sessions", { p_status: status === "all" ? undefined : status, p_limit: 300 });
  const rows = data ?? [];
  return (
    <>
      <PageHeader title="Lessons" description="Every lesson across the program. Resolve disputed lessons here." />
      <div className="mb-5 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link key={f} href={`/dashboard/admin/lessons?status=${f}`} className={cn("rounded-full px-3 py-1.5 text-sm", status === f ? "bg-ink text-white" : "text-ink-2 hover:bg-paper-2")}>
            {f === "all" ? "All" : SESSION_STATUS_LABEL[f]}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="No lessons" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">Lesson</th>
                <th className="px-3 py-3 font-medium">Family</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-3">{formatWhen(r.start_at)}</td>
                  <td className="px-3 py-3">
                    {r.subject_name} · {r.duration_minutes}m
                    <p className="text-xs text-muted">
                      {r.tutor_name} → {r.student_name}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {r.family_name}
                    <p className="text-xs text-muted">{r.family_email}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={sessionTone(r.status)}>{SESSION_STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted">
                    {r.family_response_note && <p>Family: “{r.family_response_note}”</p>}
                    {r.cancel_reason && <p>Cancel: “{r.cancel_reason}”</p>}
                    {r.review_note && <p>Review: “{r.review_note}”</p>}
                    {r.status === "disputed" && <DisputeActions sessionId={r.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
