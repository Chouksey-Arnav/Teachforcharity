"use client";
import { useActionState } from "react";
import { adminLogin } from "@/app/actions/admin";
import { Field, Input } from "@/components/ui/field";
import { Submit } from "@/components/ui/submit";
import { Notice } from "@/components/ui/notice";

export function AdminLoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(adminLogin, null);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" autoFocus required />
      </Field>
      {state && !state.ok && <Notice tone="danger">{state.error.message}</Notice>}
      <Submit className="w-full" pendingText="Checking…">
        Sign in
      </Submit>
    </form>
  );
}
