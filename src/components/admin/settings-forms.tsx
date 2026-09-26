"use client";
import { useState, useTransition } from "react";
import { setRole, updateSettings } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ActionState } from "@/lib/errors";

export function SettingsForm({ requireApproval, adminEmails }: { requireApproval: boolean; adminEmails: string }) {
  const [v, setV] = useState({ requireApproval, adminEmails });
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); start(async () => setRes(await updateSettings(v))); }}>
      <Checkbox
        checked={v.requireApproval}
        onChange={(e) => setV({ ...v, requireApproval: e.target.checked })}
        label="Require admin approval before tutors go live"
        description="Off by default: tutors go live as soon as they finish signing up and are paused automatically by a safety report or the safety scanner. Turn on to review every new tutor first."
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
  const [v, setV] = useState<{ email: string; role: "reviewer" | "family"; partnerId: string }>({ email: "", role: "reviewer", partnerId: partners[0]?.id ?? "" });
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); start(async () => setRes(await setRole(v))); }}>
      <Field label="Account email" htmlFor="re"><Input id="re" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
      <Field label="Role" htmlFor="rr">
        <Select id="rr" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as typeof v.role })}>
          <option value="reviewer">Partner reviewer</option>
          <option value="family">Remove reviewer access</option>
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
