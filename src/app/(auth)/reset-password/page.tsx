"use client";
import { useActionState } from "react";
import { updatePassword } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { Submit } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/notice";

export default function ResetPasswordPage() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <>
      <h1 className="display text-5xl">Choose a new password</h1>
      <form action={action} className="mt-8 space-y-5">
        <Field label="New password" htmlFor="password" hint="At least 8 characters, with a letter and a number.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <FormMessage state={state} />
        <Submit className="w-full" size="lg" pendingText="Saving…">
          Save password
        </Submit>
      </form>
    </>
  );
}
