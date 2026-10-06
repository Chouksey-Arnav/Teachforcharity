"use client";
import { useState, useTransition } from "react";
import { resetAdminTwoFactor, setRole, updateSettings } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ActionState } from "@/lib/errors";

export function SettingsForm({
  requireApproval,
  requireConsentVerification,
  adminEmails,
}: {
  requireApproval: boolean;
  requireConsentVerification: boolean;
  adminEmails: string;
}) {
  const [v, setV] = useState({ requireApproval, requireConsentVerification, adminEmails });
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); start(async () => setRes(await updateSettings(v))); }}>
      <Checkbox
        checked={v.requireApproval}
        onChange={(e) => setV({ ...v, requireApproval: e.target.checked })}
        label="Also wait for a person after the automated account check"
        description="Off (default): a tutor goes live on their own once their parent approves and the automated account check verifies them. Anything the check flags waits in Account checks for a person. On: verified tutors also wait for an admin to approve them in People → Tutors."
      />
      <Checkbox
        checked={v.requireConsentVerification}
        onChange={(e) => setV({ ...v, requireConsentVerification: e.target.checked })}
        label="Require a phone check before consent counts"
        description="Recommended. Each signed consent waits in Parent calls until someone confirms by phone that it came from the parent. Off: consent counts as soon as it’s signed, and a child could sign as their own parent."
      />
      <Field label="Who gets safety alerts" htmlFor="ae" hint="Comma-separated emails. Reports, critical safety flags, disputes, and account deletions are emailed here immediately. Add at least one address you check every day.">
        <Input id="ae" value={v.adminEmails} onChange={(e) => setV({ ...v, adminEmails: e.target.value })} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" pending={pending}>Save settings</Button>
        {res && (res.ok ? <span className="text-sm text-pine-800">{res.message}</span> : <Notice tone="danger" className="py-2">{res.error.message}</Notice>)}
      </div>
    </form>
  );
}

export function RoleForm({ partners }: { partners: { id: string; name: string }[] }) {
  const [v, setV] = useState<{ email: string; role: "reviewer" | "admin" | "family"; partnerId: string }>({ email: "", role: "reviewer", partnerId: partners[0]?.id ?? "" });
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); start(async () => setRes(await setRole(v))); }}>
      <Field label="Account email" htmlFor="re"><Input id="re" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
      <Field label="Role" htmlFor="rr">
        <Select id="rr" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as typeof v.role })}>
          <option value="reviewer">Partner reviewer</option>
          <option value="admin">Admin (signs in with two-factor)</option>
          <option value="family">Remove reviewer / admin access</option>
        </Select>
      </Field>
      <Field label="Partner" htmlFor="rp">
        <Select id="rp" value={v.partnerId} disabled={v.role !== "reviewer"} onChange={(e) => setV({ ...v, partnerId: e.target.value })}>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Button type="submit" pending={pending}>Set role</Button>
      {res && <div className="sm:col-span-4">{res.ok ? <Notice tone="success">{res.message}</Notice> : <Notice tone="danger">{res.error.message}</Notice>}</div>}
    </form>
  );
}

export function ResetTwoFactorButton({ userId, email }: { userId: string; email: string }) {
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  if (res?.ok) return <span className="text-xs text-muted">Reset — signed out</span>;
  return (
    <span className="flex items-center gap-2">
      {res && !res.ok && <span className="text-xs text-clay-700">{res.error.message}</span>}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        pending={pending}
        onClick={() => {
          if (!window.confirm(`Reset two-factor for ${email}? They’ll be signed out everywhere and set it up again at their next sign-in.`)) return;
          start(async () => setRes(await resetAdminTwoFactor(userId)));
        }}
      >
        Reset two-factor
      </Button>
    </span>
  );
}
