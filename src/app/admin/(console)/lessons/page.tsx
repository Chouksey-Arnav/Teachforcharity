import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, Tabs, when } from "@/components/admin/ui";
import { Badge, sessionTone } from "@/components/ui/badge";
import { DisputeActions } from "@/components/admin/dispute-actions";
import { VerifyHours } from "@/components/admin/verify-hours";
import { SESSION_STATUS_LABEL } from "@/lib/constants";

export const metadata: Metadata = { title: "Lessons" };

const TABS = [
  { key: "", label: "All" },
  { key: "pending", label: "Requested" },
  { key: "scheduled", label: "Booked" },
  { key: "completed", label: "Awaiting confirmation" },
  { key: "confirmed", label: "Awaiting verification" },
  { key: "disputed", label: "Disputed" },
  { key: "verified", label: "Verified" },
  { key: "cancelled", label: "Cancelled" },
];

export default async function LessonsPage({ searchParams }: PageProps<"/admin/lessons">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && TABS.some((t) => t.key === sp.status) ? sp.status : "";
  const db = await adminDb();
  const [{ data: rows }, { data: ov }] = await Promise.all([
    db.rpc("admin_list_sessions", { p_status: status || undefined, p_limit: 300 }),
    db.rpc("admin_overview"),
  ]);
  const counts = ((ov as { sessions?: Record<string, number> } | null)?.sessions ?? {}) as Record<string, number>;
  const lessons = rows ?? [];

  return (
    <AdminPage
      title="Lessons"
      description="Every lesson request and its full history. Hours count only after the tutor logs, the family confirms, and a verifier approves."
    >
      <Tabs
        active={status}
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: t.key ? `/admin/lessons?status=${t.key}` : "/admin/lessons",
          count: t.key ? (counts[t.key] ?? 0) : Object.values(counts).reduce((a, b) => a + b, 0),
        }))}
      />
      {!lessons.length ? (
        <Empty>No lessons here.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {status === "confirmed" && <VerifyHours ids={lessons.map((l) => l.id)} />}
          <ul className="divide-y divide-line">
            {lessons.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                {status === "confirmed" && <input type="checkbox" name="verify" value={l.id} className="mt-1" aria-label="Select lesson" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {l.subject_name} · {l.duration_minutes} min
                    </span>
                    <Badge tone={sessionTone(l.status)}>{SESSION_STATUS_LABEL[l.status] ?? l.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {when(l.start_at)} ·{" "}
                    <Link href={`/admin/people/${l.tutor_id}`} className="text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
                      {l.tutor_name}
                    </Link>{" "}
                    teaching {l.student_name} ({l.family_name})
                  </p>
                  {(l.cancel_reason || l.family_response_note || l.review_note) && (
                    <p className="mt-1 text-[13px] text-ink-2">{[l.cancel_reason, l.family_response_note && `Family: “${l.family_response_note}”`, l.review_note && `Review: ${l.review_note}`].filter(Boolean).join(" · ")}</p>
                  )}
                  {l.status === "disputed" && <DisputeActions sessionId={l.id} />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AdminPage>
  );
}
