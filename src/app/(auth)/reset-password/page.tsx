"use client";
import { useActionState } from "react";
import { updatePassword } from "@/app/actions/auth";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/secret-inputs";
import { Submit } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/notice";

export default function ResetPasswordPage() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <>
      <h1 className="display text-5xl">Choose a new password</h1>
      <form action={action} className="mt-8 space-y-5">
        <Field label="New password" htmlFor="password" hint="At least 8 characters, with a letter and a number.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
        </Field>
        <FormMessage state={state} />
        <Submit className="w-full" size="lg" pendingText="Saving…">
          Save password
        </Submit>
      </form>
    </>
  );
}
