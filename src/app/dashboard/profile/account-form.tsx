"use client";
import { useState, useTransition } from "react";
import { updateAccount } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ActionState } from "@/lib/errors";

export function AccountForm({ role, kind, initial }: { role: string; kind?: string | null; initial: { fullName: string; phone: string; emailNotifications: boolean } }) {
  const [v, setV] = useState(initial);
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setRes(await updateAccount(v)));
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={kind === "student" ? "First name" : "Full name"} htmlFor="an">
          <Input id="an" value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
        </Field>
        {role !== "tutor" && kind !== "student" && (
          <Field label="Mobile phone" htmlFor="ap" hint={role === "family" ? "Must be reachable during lessons. Never shown to tutors." : undefined}>
            <Input id="ap" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </Field>
        )}
      </div>
      <Checkbox
        checked={v.emailNotifications}
        onChange={(e) => setV({ ...v, emailNotifications: e.target.checked })}
        label="Email me when I get a new message"
        description="Lesson requests, bookings, cancellations, and safety notices are always emailed."
      />
      {res && (res.ok ? <Notice tone="success">{res.message}</Notice> : <Notice tone="danger">{res.error.message}</Notice>)}
      <Button type="submit" pending={pending}>
        Save account
      </Button>
    </form>
  );
}
