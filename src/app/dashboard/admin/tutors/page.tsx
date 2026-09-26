import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/cn";
import { TutorActions } from "./tutor-actions";

export const metadata: Metadata = { title: "Tutors · Admin" };

const TABS = [
  ["pending", "Awaiting approval"],
  ["active", "Active"],
  ["paused", "Paused"],
  ["removed", "Removed"],
  ["onboarding", "Still signing up"],
  ["all", "All"],
] as const;
const STATUS_TONE: Record<string, Tone> = { active: "pine", pending: "brass", paused: "clay", removed: "neutral" };

export default async function AdminTutorsPage({ searchParams }: PageProps<"/dashboard/admin/tutors">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "pending";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_tutors", { p_status: status === "all" ? undefined : status, p_search: q || undefined });
  const tutors = (data ?? []).filter((t) => (status === "pending" ? t.onboarded_at : true));

  return (
    <>
      <PageHeader title="Tutors" description="Approve new tutors, and pause or remove anyone while a concern is reviewed. Every change is recorded in the audit log." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map(([k, l]) => (
            <Link key={k} href={`/dashboard/admin/tutors?status=${k}`} className={cn("rounded-full px-3.5 py-1.5 text-sm", status === k ? "bg-ink text-white" : "text-ink-2 hover:bg-paper-2")}>
              {l}
            </Link>
          ))}
        </div>
        <form action="/dashboard/admin/tutors" className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Search name, email, school" className="h-9 w-56 rounded-full border border-line-2 bg-card px-4 text-sm" />
        </form>
      </div>
      {tutors.length === 0 ? (
        <Empty title="No tutors here" />
      ) : (
        <div className="space-y-3">
          {tutors.map((t) => (
            <details key={t.user_id} className="group rounded-2xl border border-line bg-card" open={status === "pending"}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4 px-5 py-4">
                <Avatar name={t.full_name || t.email} path={t.avatar_path} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.full_name || "(no name yet)"}</p>
                  <p className="truncate text-sm text-muted">
                    {t.grade ? `${t.grade}th` : "—"} · {t.school ?? "—"} · {t.subjects ?? "no instruments"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {t.open_incidents > 0 && <Badge tone="clay">{t.open_incidents} open report{t.open_incidents > 1 ? "s" : ""}</Badge>}
                  {!t.onboarded_at && <Badge>Signing up</Badge>}
                  <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                </div>
              </summary>
              <div className="grid gap-5 border-t border-line px-5 py-4 text-sm md:grid-cols-3">
                <dl className="space-y-1.5">
                  <div><dt className="text-xs text-muted">Email</dt><dd>{t.email}</dd></div>
                  <div><dt className="text-xs text-muted">County</dt><dd>{t.county ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Meet link</dt><dd>{t.meet_url ? <a className="text-pine-700 underline" href={t.meet_url} target="_blank" rel="noopener noreferrer">{t.meet_url.replace("https://", "")}</a> : "—"}</dd></div>
                </dl>
                <dl className="space-y-1.5">
                  <div><dt className="text-xs text-muted">Parent/guardian</dt><dd>{t.guardian_name ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Guardian contact</dt><dd>{[t.guardian_email, t.guardian_phone].filter(Boolean).join(" · ") || "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Agreement signed</dt><dd>{t.agreement_signed_at ? formatDate(t.agreement_signed_at) : "Not yet"}</dd></div>
                </dl>
                <dl className="space-y-1.5">
                  <div><dt className="text-xs text-muted">Students</dt><dd>{t.active_students}/{t.max_students}</dd></div>
                  <div><dt className="text-xs text-muted">Verified lessons</dt><dd>{t.lessons_verified}</dd></div>
                  <div><dt className="text-xs text-muted">Joined</dt><dd>{formatDate(t.created_at)}{t.approved_at ? ` · approved ${formatDate(t.approved_at)}` : ""}</dd></div>
                  {t.status_reason && <div><dt className="text-xs text-muted">Status note</dt><dd>{t.status_reason}</dd></div>}
                </dl>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-line bg-paper/50 px-5 py-3">
                <TutorActions tutorId={t.user_id} status={t.status} onboarded={Boolean(t.onboarded_at)} />
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
