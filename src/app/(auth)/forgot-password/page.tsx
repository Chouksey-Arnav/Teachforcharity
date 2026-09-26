"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { requestPasswordReset, resetPasswordWithCode } from "@/app/actions/auth";
import { CodeStep } from "@/components/auth/code-step";
import { Field, Input } from "@/components/ui/field";
import { Submit } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/notice";

const CODE_ERRORS = new Set(["INVALID", "EXPIRED", "LOCKED", "MISSING", "BAD_CODE"]);

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, null);
  const [resetState, resetAction] = useActionState(resetPasswordWithCode, null);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");

  const codeError = resetState && !resetState.ok && CODE_ERRORS.has(resetState.error.code ?? "") ? resetState.error.message : null;

  useEffect(() => {
    if (state?.ok) setStep("code");
  }, [state]);

  return (
    <>
      <h1 className="display text-5xl">Reset your password</h1>
      <p className="mt-3 text-muted">
        {step === "email" ? "We’ll email you a 6-digit code to choose a new one." : "Enter the code and choose a new password."}
      </p>
      {step === "email" ? (
        <form
          action={(fd: FormData) => {
            setEmail(String(fd.get("email") ?? "").trim().toLowerCase());
            action(fd);
          }}
          className="mt-8 space-y-5"
        >
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} required />
          </Field>
          <FormMessage state={state} />
          <Submit className="w-full" size="lg" pendingText="Sending…">
            Send code
          </Submit>
        </form>
      ) : (
        <form action={resetAction} className="mt-8" noValidate>
          <input type="hidden" name="email" value={email} />
          <CodeStep
            email={email}
            purpose="reset"
            error={codeError}
            onBack={() => setStep("email")}
          >
            <Field label="New password" htmlFor="password" hint="At least 8 characters, with a letter and a number.">
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
            {!codeError && <FormMessage state={resetState} />}
            <Submit className="w-full" size="lg" pendingText="Saving…">
              Save new password
            </Submit>
          </CodeStep>
        </form>
      )}
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-pine-700 underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
