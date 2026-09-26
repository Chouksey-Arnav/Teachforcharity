import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMySessions } from "@/lib/data";
import { SESSION_STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/time";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge, sessionTone } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "My hours" };

const COUNTED = ["completed", "confirmed", "disputed", "verified", "rejected"];

export default async function HoursPage() {
  const viewer = await requireViewer(["tutor"]);
  const supabase = await createClient();
  const sessions = (await getMySessions(supabase, "all", 500)).filter((s) => COUNTED.includes(s.status)).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const minutes = (st: string[]) => sessions.filter((s) => st.includes(s.status)).reduce((a, s) => a + s.duration_minutes, 0);
  const verified = sessions.filter((s) => s.status === "verified");
  const h = (m: number) => (m / 60).toFixed(2).replace(/\.?0+$/, "") || "0";
  const t = viewer.tutor!;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Volunteer hours"
          description="Hours count once you log a lesson, the family confirms it, and our nonprofit partner verifies it."
          actions={verified.length ? <PrintButton /> : undefined}
        />
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Verified hours", minutes(["verified"])],
            ["Hours awaiting weekly verification", minutes(["confirmed"])],
            ["Hours awaiting family confirmation", minutes(["completed"])],
          ].map(([label, m]) => (
            <div key={String(label)} className="rounded-2xl border border-line bg-card p-5">
              <p className="display text-5xl">{h(Number(m))}</p>
              <p className="mt-1 text-sm text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {sessions.length === 0 ? (
        <Empty icon={<BadgeCheck className="size-5" />} title="No logged lessons yet">
          After each lesson, open it in Lessons and tap “It happened.” The family then confirms, and our partner verifies your hours weekly.
        </Empty>
      ) : (
        <section className="print-card rounded-2xl border border-line bg-card">
          <div className="border-b border-line px-5 py-5 sm:px-7">
            <p className="eyebrow">{SITE.name}</p>
            <h2 className="display mt-1 text-3xl">Volunteer hours record</h2>
            <p className="mt-2 text-sm text-ink-2">
              {viewer.profile.full_name} · {t.grade}th grade{t.school ? ` · ${t.school}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted">
              Generated {formatDate(new Date())}. Verified hours: <strong>{h(minutes(["verified"]))}</strong> across {verified.length} lesson
              {verified.length === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-5 py-3 font-medium sm:px-7">Date</th>
                  <th className="px-3 py-3 font-medium">Lesson</th>
                  <th className="px-3 py-3 font-medium">Length</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium sm:px-7">Verified by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap px-5 py-3 sm:px-7">
                      {formatDate(s.start_at)} <span className="text-muted">{formatTime(s.start_at)}</span>
                    </td>
                    <td className="px-3 py-3">
                      {s.subject_name} · {s.student_name}
                    </td>
                    <td className="px-3 py-3">{s.duration_minutes} min</td>
                    <td className="px-3 py-3">
                      <Badge tone={sessionTone(s.status)}>{SESSION_STATUS_LABEL[s.status]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted sm:px-7">{s.verified_at && s.status === "verified" ? `${s.verifier_org ?? "Partner"}, ${formatDate(s.verified_at)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-4 text-xs leading-relaxed text-muted sm:px-7">
            Each verified lesson was logged by the tutor, confirmed by the student’s parent or guardian, and verified in a weekly review by the program’s nonprofit partner (or, where shown, the program administrator).
            Acceptance of these hours toward any school or honor-society requirement is determined by that organization.
          </p>
        </section>
      )}
    </>
  );
}
