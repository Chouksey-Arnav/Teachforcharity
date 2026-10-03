import type { Metadata } from "next";
import { FileCheck2, PhoneCall } from "lucide-react";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, PersonLink, Tabs, ago, when } from "@/components/admin/ui";
import { ConsentCallControls } from "@/components/admin/consent-call-controls";
import { ConsentFormReview } from "@/components/admin/consent-form-review";
import { CONSENT_FORM_BUCKET } from "@/lib/consent-form/storage";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Parent checks" };

export default async function ConsentCallsPage({ searchParams }: PageProps<"/admin/consents">) {
  const sp = await searchParams;
  const view = sp.view === "verified" || sp.view === "rejected" ? sp.view : "pending";
  const db = await adminDb();
  const [{ data }, { data: settings }] = await Promise.all([
    db.rpc("admin_list_consent_checks", { p_status: view }),
    db.from("app_settings").select("require_consent_verification").maybeSingle(),
  ]);
  const rows = data ?? [];
  // Signed links to uploaded form photos, readable only by two-factor admins (storage policy), for 15 minutes.
  const paths = rows.map((r) => r.form_path).filter(Boolean);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await db.storage.from(CONSENT_FORM_BUCKET).createSignedUrls(paths, 900);
    for (const x of signed ?? []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl);
  }

  return (
    <AdminPage
      title="Parent checks"
      description="Every consent waits until someone confirms it came from the student’s parent or guardian — by a short phone call, or by checking a photo of the form signed in ink. Lessons, messaging and tutor matching unlock when you mark it verified."
    >
      {settings && !settings.require_consent_verification && (
        <Notice tone="warning" className="mb-5" title="Parent checks are switched off">
          Consent counts as soon as it’s signed. Turn “Require a parent check” back on in Settings.
        </Notice>
      )}
      <Tabs
        active={view}
        items={[
          { key: "pending", label: "To check", href: "/admin/consents" },
          { key: "verified", label: "Verified", href: "/admin/consents?view=verified" },
          { key: "rejected", label: "Couldn’t verify", href: "/admin/consents?view=rejected" },
        ]}
      />
      {!rows.length ? (
        <Empty>{view === "pending" ? "Nobody is waiting for a check. 🎉" : "Nothing here yet."}</Empty>
      ) : (
        <div className="space-y-4">
          {view === "pending" && (
            <div className="grid gap-4 md:grid-cols-2">
              <ol className="rounded-xl border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2">
                <li className="mb-1 font-semibold text-ink">Phone call</li>
                <li>1. Call the number below. Introduce yourself and the program.</li>
                <li>2. Ask for the person by name and confirm they’re {`the student's`} parent or legal guardian, 18 or older, and that they signed the form.</li>
                <li>3. Confirm they understand: online only, never recorded, a parent reachable during every lesson.</li>
                <li>4. If anything feels off (a child answers, nobody knows about it, the number is wrong), choose “Couldn’t verify”.</li>
              </ol>
              <ol className="rounded-xl border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2">
                <li className="mb-1 font-semibold text-ink">Signed form (listed first when one is waiting)</li>
                <li>1. Open the photo full size. Check every box only if it’s true.</li>
                <li>2. Blurry, cut off, typed signature, wrong or missing code → “Send back” with what to fix.</li>
                <li>3. Looks forged, edited, a child’s handwriting, or the same photo as another family → “Couldn’t verify”, or call instead.</li>
                <li>4. Never verify your own family. Not sure? Call the number instead — that’s always allowed.</li>
              </ol>
            </div>
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
                      {r.verification_status === "verified" ? "Verified" : "Not verified"}
                      {r.verification_method === "signed_form" ? " (signed form)" : r.verification_method === "phone" ? " (phone)" : ""} by{" "}
                      {r.verified_by_name ?? "an admin"} {when(r.verified_at)}:{" "}
                      <em>{r.verification_note}</em>
                    </p>
                  )}
                </div>
              </div>
              {r.form_path && view === "pending" && (
                <div className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-[minmax(0,240px)_1fr]">
                  {urls.get(r.form_path) ? (
                    <a href={urls.get(r.form_path)} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-lg border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
                      <img src={urls.get(r.form_path)} alt={`Signed consent form uploaded for ${r.student_name}`} className="w-full bg-paper object-contain" />
                    </a>
                  ) : (
                    <p className="text-sm text-clay-700">The photo couldn’t be loaded. Reload the page.</p>
                  )}
                  <div className="space-y-1.5 text-sm">
                    <p className="flex items-center gap-2 font-semibold">
                      <FileCheck2 className="size-4 text-pine-700" /> Signed form uploaded {r.form_submitted_at ? ago(r.form_submitted_at) : ""}
                    </p>
                    <p>
                      Code to match: <strong className="font-mono text-base tracking-wider">{r.verification_code}</strong>
                    </p>
                    <p className="text-muted">Tap the photo to open it full size. The link expires in 15 minutes.</p>
                    {r.form_used_by_other_families > 0 && (
                      <Badge tone="clay">Same photo uploaded on {r.form_used_by_other_families} other account{r.form_used_by_other_families === 1 ? "" : "s"}</Badge>
                    )}
                  </div>
                </div>
              )}
              {view === "pending" &&
                (r.form_path ? (
                  <ConsentFormReview consentId={r.id} code={r.verification_code} guardianName={r.guardian_name} studentName={r.student_name} />
                ) : (
                  <ConsentCallControls consentId={r.id} guardianName={r.guardian_name} />
                ))}
            </article>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
