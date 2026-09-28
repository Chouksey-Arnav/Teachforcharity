import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { adminDb, adminServiceDb } from "@/lib/admin/session";
import { AdminPage, Panel, when } from "@/components/admin/ui";
import { SettingsForm, RoleForm, ResetTwoFactorButton } from "@/components/admin/settings-forms";
import { PartnerEditor } from "@/components/admin/partner-editor";
import { emailProvider } from "@/lib/email/provider";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Settings & health" };

type Health = {
  jobs: { name: string; schedule: string; active: boolean; last_run: { status: string; start: string; message: string } | null }[];
  extensions: string[];
  last_email_sent: string | null;
  oldest_queued_email: string | null;
  last_moderation: { started_at: string; error: string | null } | null;
  unscanned_messages: number;
  settings: { require_tutor_approval: boolean; admin_emails: string[]; consent_version: string };
};

function Check({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail?: string }) {
  const Icon = ok ? CheckCircle2 : warn ? CircleAlert : XCircle;
  return (
    <li className="flex gap-2.5 py-2 text-sm">
      <Icon className={ok ? "mt-0.5 size-4 shrink-0 text-pine-700" : warn ? "mt-0.5 size-4 shrink-0 text-brass-600" : "mt-0.5 size-4 shrink-0 text-clay-700"} />
      <span>
        <span className="font-medium">{label}</span>
        {detail && <span className="block text-xs text-muted">{detail}</span>}
      </span>
    </li>
  );
}

const set = (k: string) => Boolean(process.env[k]?.trim());

export default async function SettingsPage() {
  const db = await adminDb();
  const [{ data: h }, { data: partners }, { data: reviewers }, { data: http }] = await Promise.all([
    db.rpc("admin_health"),
    db.from("partners").select("*").order("created_at"),
    db.from("profiles").select("id, full_name, email, role").in("role", ["reviewer", "admin"]).order("role"),
    db.rpc("admin_cron_http"),
  ]);
  // pg_cron marks a run "succeeded" once the request is queued; this is what the app actually answered.
  const admins = await adminTwoFactorStatus((reviewers ?? []).filter((r) => r.role === "admin"));
  const calls = http as { ok: number; failed: number; last_status: number | null; last_error: string | null; last_at: string | null } | null;
  const callsOk = Boolean(calls && calls.ok > 0 && calls.last_status !== null && calls.last_status < 300);
  const health = h as unknown as Health;
  const job = (n: string) => health.jobs.find((j) => j.name === n);
  const provider = emailProvider();
  const missing = provider.missingConfig();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <AdminPage title="Settings & health" description="Program settings, who can verify hours, the current partner, and a live check of every part of the deployment.">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Alerts & tutor approval">
          <SettingsForm requireApproval={health.settings.require_tutor_approval} adminEmails={health.settings.admin_emails.join(", ")} />
        </Panel>

        <Panel title="Deployment health" className="scroll-mt-20" >
          <div id="health" />
          <ul className="divide-y divide-line">
            <Check
              ok={admins.every((a) => a.mfa)}
              warn
              label="Every admin uses two-factor sign-in"
              detail={admins.filter((a) => !a.mfa).map((a) => a.email).join(", ") ? `Not set up yet: ${admins.filter((a) => !a.mfa).map((a) => a.email).join(", ")} (they’ll be asked at their next sign-in)` : `${admins.length} admin${admins.length === 1 ? "" : "s"}, all with two-factor.`}
            />
            <Check ok={set("SUPABASE_SERVICE_ROLE_KEY")} label="Database service key (SUPABASE_SERVICE_ROLE_KEY)" />
            <Check ok={set("NEXT_PUBLIC_SUPABASE_URL") && set("NEXT_PUBLIC_SUPABASE_ANON_KEY")} label="Supabase URL + publishable key" />
            <Check ok={Boolean(siteUrl) && !siteUrl.includes("localhost")} label="Site URL (NEXT_PUBLIC_SITE_URL)" detail={siteUrl || "Not set — email links will point to localhost."} />
            <Check ok={!missing.length} label={`Email provider: ${provider.name}`} detail={missing.length ? `Missing ${missing.join(", ")}` : `Last email sent ${when(health.last_email_sent)}`} />
            <Check ok={set("CRON_SECRET") || set("SUPABASE_CRON_SECRET")} label="Scheduled-job secret (CRON_SECRET / SUPABASE_CRON_SECRET)" />
            <Check
              ok={callsOk}
              warn={!calls || calls.ok + calls.failed === 0}
              label="Database → site connection"
              detail={
                !calls || calls.ok + calls.failed === 0
                  ? "No scheduled calls in the last hour."
                  : `Last hour: ${calls.ok} ok, ${calls.failed} failed · last answer ${calls.last_status ?? "none"} ${when(calls.last_at)}${
                      calls.last_status === 401 ? " — SUPABASE_CRON_SECRET in Vercel doesn’t match the database’s tfac_cron_secret (or needs a redeploy)." : calls.last_error && !callsOk ? ` — ${calls.last_error}` : ""
                    }`
              }
            />
            <Check ok={Boolean(job("tfac-maintenance")?.active)} label="Database maintenance (every 15 min)" detail="Expires stale requests, queues reminders, deletes unapproved student accounts after 14 days." />
            <Check
              ok={Boolean(job("tfac-email-drain")?.active)}
              warn
              label="Email delivery job (every 2 min)"
              detail={job("tfac-email-drain") ? `Last run: ${job("tfac-email-drain")?.last_run?.status ?? "—"} ${when(job("tfac-email-drain")?.last_run?.start)}` : "Not scheduled — emails from reminders only go out when the daily Vercel cron runs. See docs/SETUP.md §5."}
            />
            <Check
              ok={Boolean(job("tfac-safety-scan")?.active)}
              warn
              label="Safety scan job (hourly)"
              detail={`Last scan ${when(health.last_moderation?.started_at)}${health.last_moderation?.error ? ` — error: ${health.last_moderation.error}` : ""} · ${health.unscanned_messages} messages waiting`}
            />
            <Check ok={health.settings.admin_emails.length > 0 || (reviewers ?? []).some((r) => r.role === "admin")} label="Someone receives safety alerts" detail={health.settings.admin_emails.join(", ") || "Add an alert email on the left."} />
            <Check ok={Boolean(SITE.contactEmail)} warn label="Public contact email (NEXT_PUBLIC_CONTACT_EMAIL)" detail={SITE.contactEmail || "Shown in the footer and legal pages."} />
          </ul>
          <p className="mt-3 text-xs text-muted">Values are never shown here — only whether each one is set. Database extensions: {health.extensions.join(", ")}.</p>
        </Panel>
      </div>

      <Panel title="Admins" className="mt-5">
        <p className="mb-4 text-sm text-muted">
          Admins sign in at /admin with their own account and a code from an authenticator app. To add one, have them create an account, then choose
          “Admin” below. If someone loses their phone, reset their two-factor here and they’ll set it up again at their next sign-in.
        </p>
        <ul className="divide-y divide-line text-sm">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {a.name || a.email} <span className="text-muted">· {a.email}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className={a.mfa ? "text-pine-700" : "text-brass-700"}>{a.mfa ? "Two-factor on" : "Two-factor not set up"}</span>
                {a.mfa && !a.me && <ResetTwoFactorButton userId={a.id} email={a.email} />}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Partner reviewers (verify volunteer hours)" className="mt-5">
        <p className="mb-4 text-sm text-muted">
          Reviewers sign in to the regular site and see only the weekly hours queue. Ask them to create an account first, then enter their email here.
        </p>
        <RoleForm partners={(partners ?? []).map((p) => ({ id: p.id, name: p.name }))} />
        {(reviewers ?? []).some((r) => r.role === "reviewer") && (
          <ul className="mt-4 divide-y divide-line text-sm">
            {(reviewers ?? []).filter((r) => r.role === "reviewer").map((r) => (
              <li key={r.id} className="flex justify-between py-2">
                <span>{r.full_name || r.email}</span>
                <span className="text-muted">
                  {r.role} · {r.email}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Partner & cause" className="mt-5">
        <PartnerEditor partners={partners ?? []} />
      </Panel>
    </AdminPage>
  );
}

/** Whether each admin has a verified authenticator (read with the service role; never shows the factor itself). */
async function adminTwoFactorStatus(admins: { id: string; full_name: string; email: string }[]) {
  const { db, session } = await adminServiceDb();
  return Promise.all(
    admins.map(async (a) => {
      const { data } = await db.auth.admin.mfa.listFactors({ userId: a.id });
      return {
        id: a.id,
        name: a.full_name,
        email: a.email,
        me: a.id === session.userId,
        mfa: Boolean(data?.factors.some((f) => f.factor_type === "totp" && f.status === "verified")),
      };
    }),
  );
}
