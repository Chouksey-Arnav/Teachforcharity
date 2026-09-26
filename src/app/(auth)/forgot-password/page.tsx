"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { Submit } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/notice";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <>
      <h1 className="display text-5xl">Reset your password</h1>
      <p className="mt-3 text-muted">We’ll email you a link to choose a new one.</p>
      <form action={action} className="mt-8 space-y-5">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <FormMessage state={state} />
        <Submit className="w-full" size="lg" pendingText="Sending…">
          Send reset link
        </Submit>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-pine-700 underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
