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
import QRCode from "qrcode";
import { PrintButton } from "./print-button";
import { HoursLinkControls } from "./link-controls";

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
  const { data: code } = await supabase.rpc("my_verify_code", { p_action: "get" });
  const verifyUrl = code ? `${SITE.url}/verify/${code}` : null;
  const qr = verifyUrl ? await QRCode.toString(verifyUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : null;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Volunteer hours"
          description="Two-step verification: you log a lesson truthfully, your student confirms you were there (step 1), and our nonprofit partner certifies it in a weekly review (step 2). Only certified hours appear on your printed record and verification link."
          actions={verified.length ? <PrintButton /> : undefined}
        />
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Certified hours (both steps done)", minutes(["verified"])],
            ["Student-verified, awaiting partner", minutes(["confirmed"])],
            ["Awaiting your student’s check-in", minutes(["completed"])],
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
          After each lesson, open it in Lessons and tap “It happened.” Your student confirms you were there next time they open the site, and our partner certifies your hours weekly.
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
          <div className={`flex flex-col gap-5 border-t border-line px-5 py-5 sm:flex-row sm:items-start sm:px-7${verifyUrl ? "" : " no-print"}`}>
            {qr && verifyUrl && (
              // Library-generated SVG from our own URL; no user input reaches it.
              <div className="size-28 shrink-0 rounded-lg bg-white p-2" role="img" aria-label="QR code for the verification link" dangerouslySetInnerHTML={{ __html: qr }} />
            )}
            <div className="min-w-0 text-sm">
              <p className="font-semibold">Check these hours online</p>
              {verifyUrl ? (
                <>
                  <p className="mt-1 text-ink-2">
                    A school or honor-society advisor can scan the code or visit <span className="break-all font-mono text-[13px]">{verifyUrl}</span> to see your verified totals, straight from the program.
                  </p>
                  <p className="no-print mt-2 text-xs text-muted">Anyone with this link sees your name, grade, school, instruments and verified totals — never students’ names or messages.</p>
                </>
              ) : (
                <p className="mt-1 text-ink-2">
                  Make a private link (with a QR code on this printout) so an advisor can confirm your verified hours with the program directly. It shows your name, grade, school, instruments and verified totals — never students’ names. You can turn it off any time.
                </p>
              )}
              <HoursLinkControls url={verifyUrl} />
            </div>
          </div>
          <p className="border-t border-line px-5 py-4 text-xs leading-relaxed text-muted sm:px-7">
            Each verified lesson was logged by the tutor, confirmed on the site by the student or their parent or guardian, and verified in a weekly review by the program’s nonprofit partner (or, where shown, the program administrator).
            Acceptance of these hours toward any school or honor-society requirement is determined by that organization.
          </p>
        </section>
      )}
    </>
  );
}
