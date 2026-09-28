import type { Metadata } from "next";
import { PhoneCall } from "lucide-react";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, PersonLink, Tabs, ago, when } from "@/components/admin/ui";
import { ConsentCallControls } from "@/components/admin/consent-call-controls";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Parent calls" };

export default async function ConsentCallsPage({ searchParams }: PageProps<"/admin/consents">) {
  const sp = await searchParams;
  const view = sp.view === "verified" || sp.view === "rejected" ? sp.view : "pending";
  const db = await adminDb();
  const [{ data }, { data: settings }] = await Promise.all([
    db.rpc("admin_list_consent_checks", { p_status: view }),
    db.from("app_settings").select("require_consent_verification").maybeSingle(),
  ]);
  const rows = data ?? [];

  return (
    <AdminPage
      title="Parent calls"
      description="Every consent form waits for a short phone call confirming it came from the student’s parent or guardian. Lessons, messaging and tutor matching unlock when you mark it verified."
    >
      {settings && !settings.require_consent_verification && (
        <Notice tone="warning" className="mb-5" title="Phone checks are switched off">
          Consent counts as soon as it’s signed. Turn “Require a phone check” back on in Settings.
        </Notice>
      )}
      <Tabs
        active={view}
        items={[
          { key: "pending", label: "To call", href: "/admin/consents" },
          { key: "verified", label: "Verified", href: "/admin/consents?view=verified" },
          { key: "rejected", label: "Couldn’t verify", href: "/admin/consents?view=rejected" },
        ]}
      />
      {!rows.length ? (
        <Empty>{view === "pending" ? "Nobody is waiting for a call. 🎉" : "Nothing here yet."}</Empty>
      ) : (
        <div className="space-y-4">
          {view === "pending" && (
            <ol className="rounded-xl border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2">
              <li>1. Call the number below. Introduce yourself and the program.</li>
              <li>2. Ask for the person by name and confirm they’re {`the student's`} parent or legal guardian, 18 or older, and that they signed the form.</li>
              <li>3. Confirm they understand: online only, never recorded, a parent reachable during every lesson.</li>
              <li>4. If anything feels off (a child answers, nobody knows about it, the number is wrong), choose “Couldn’t verify”.</li>
            </ol>
          )}
          {rows.map((r) => (
            <article key={r.id} className="overflow-hidden rounded-xl border border-line bg-card">
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5 text-sm">
                  <p className="text-base font-semibold">
                    {r.guardian_name} <span className="font-normal text-muted">({r.relationship})</span>
                  </p>
                  <p className="flex items-center gap-2 text-lg font-semibold text-pine-800">
                    <PhoneCall className="size-4" />
                    <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="underline-offset-4 hover:underline">
                      {r.phone}
                    </a>
                    {r.phone_used_by_other_families > 0 && (
                      <Badge tone="clay">Same number on {r.phone_used_by_other_families} other account{r.phone_used_by_other_families === 1 ? "" : "s"}</Badge>
                    )}
                  </p>
                  <p className="text-muted">
                    For <strong className="text-ink">{r.student_name}</strong>, grade {r.student_grade}
                    {r.student_county ? ` · ${r.student_county} County` : ""}
                  </p>
                  <p className="text-muted">
                    Account: <PersonLink id={r.account_id} name={r.account_name || r.account_email} kind={r.account_kind === "student" ? "student account" : "parent"} /> ·{" "}
                    {r.account_email} · created {ago(r.account_created_at)}
                  </p>
                  <p className="text-xs text-faint">
                    Signed {when(r.signed_at)} ({ago(r.signed_at)})
                  </p>
                  {r.verified_at && (
                    <p className="text-[13px] text-ink-2">
                      {r.verification_status === "verified" ? "Verified" : "Not verified"} by {r.verified_by_name ?? "an admin"} {when(r.verified_at)}:{" "}
                      <em>{r.verification_note}</em>
                    </p>
                  )}
                </div>
              </div>
              {view === "pending" && <ConsentCallControls consentId={r.id} guardianName={r.guardian_name} />}
            </article>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
