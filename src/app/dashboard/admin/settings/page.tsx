import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsForm, RoleForm } from "./forms";

export const metadata: Metadata = { title: "Settings · Admin" };

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: staff }, { data: partners }] = await Promise.all([
    supabase.from("app_settings").select("*").single(),
    supabase.rpc("admin_find_user", { p_email: "" }),
    supabase.from("partners").select("id, name, short_name"),
  ]);
  return (
    <>
      <PageHeader title="Settings & roles" />
      <div className="space-y-6">
        <Card className="p-5 sm:p-7">
          <h2 className="display text-3xl">Program settings</h2>
          <div className="mt-6">
            <SettingsForm requireApproval={settings?.require_tutor_approval ?? true} adminEmails={(settings?.admin_emails ?? []).join(", ")} />
          </div>
          <p className="mt-6 text-xs text-muted">
            Document versions — consent: {settings?.consent_version} · terms: {settings?.terms_version} · messaging: {settings?.messaging_terms_version} · tutor agreement:{" "}
            {settings?.tutor_agreement_version}. Bumping a version (in the database) requires everyone to re-accept that document.
          </p>
        </Card>
        <Card className="p-5 sm:p-7">
          <h2 className="display text-3xl">Admins & partner reviewers</h2>
          <p className="mt-1 text-sm text-muted">
            Reviewers verify weekly hours. To add one: have them sign up at /signup as a family (skip the questionnaire), then set their role here.
          </p>
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {(staff ?? []).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <strong>{u.full_name || "—"}</strong> <span className="text-muted">{u.email}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={u.role === "admin" ? "ink" : "pine"}>{u.role}</Badge>
                  {u.partner_id && <span className="text-xs text-muted">{partners?.find((p) => p.id === u.partner_id)?.short_name ?? ""}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <RoleForm partners={(partners ?? []).map((p) => ({ id: p.id, name: p.short_name ?? p.name }))} />
          </div>
        </Card>
      </div>
    </>
  );
}
