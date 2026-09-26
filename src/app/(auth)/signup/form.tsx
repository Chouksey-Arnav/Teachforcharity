"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { GraduationCap, Users } from "lucide-react";
import { signUp, verifySignup } from "@/app/actions/auth";
import { CodeStep } from "@/components/auth/code-step";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Submit } from "@/components/ui/submit";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";

type Role = "family" | "tutor";

export function SignupForm({ initialRole }: { initialRole: Role | null }) {
  const [role, setRole] = useState<Role | null>(initialRole);
  const [state, action] = useActionState(signUp, null);
  const [verifyState, verifyAction] = useActionState(verifySignup, null);
  // What was submitted in step 1, carried into step 2 (the account is created only after the code checks out).
  const [details, setDetails] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"details" | "code">("details");

  useEffect(() => {
    if (state?.ok) setStep("code");
  }, [state]);

  if (step === "code") {
    return (
      <form action={verifyAction} className="mt-8" noValidate>
        {Object.entries(details).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <h2 className="display mb-4 text-3xl">Check your email</h2>
        <CodeStep
          email={details.email}
          purpose="signup"
          name={details.fullName}
          error={verifyState && !verifyState.ok ? verifyState.error.message : null}
          onBack={() => setStep("details")}
        >
          <Submit className="w-full" size="lg" pendingText="Verifying…">
            Verify and create account
          </Submit>
        </CodeStep>
      </form>
    );
  }

  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form
      action={(fd: FormData) => {
        setDetails({
          role: String(fd.get("role") ?? ""),
          fullName: String(fd.get("fullName") ?? ""),
          email: String(fd.get("email") ?? "").trim().toLowerCase(),
          password: String(fd.get("password") ?? ""),
          eligible: String(fd.get("eligible") ?? ""),
        });
        action(fd);
      }}
      className="mt-8 space-y-6"
      noValidate
    >
      <fieldset>
        <legend className="mb-3 text-sm font-medium">I’m signing up as…</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { key: "family", icon: Users, title: "A parent or guardian", body: "For a middle schooler who wants lessons" },
              { key: "tutor", icon: GraduationCap, title: "A high school tutor", body: "Grades 9–12, volunteering to teach" },
            ] as const
          ).map(({ key, icon: Icon, title, body }) => (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer flex-col rounded-2xl border bg-card p-4 transition",
                role === key ? "border-pine-700 ring-4 ring-pine-600/10" : "border-line hover:border-line-2",
              )}
            >
              <input type="radio" name="role" value={key} checked={role === key} onChange={() => setRole(key)} className="sr-only" />
              <Icon className={cn("size-5", role === key ? "text-pine-700" : "text-muted")} />
              <span className="mt-3 text-sm font-semibold">{title}</span>
              <span className="mt-0.5 text-[13px] text-muted">{body}</span>
            </label>
          ))}
        </div>
        {fe.role && <p className="mt-2 text-[13px] text-clay-700">Choose one to continue.</p>}
      </fieldset>

      {role && (
        <div className="animate-rise space-y-5">
          <Field
            label={role === "family" ? "Your name (parent or guardian)" : "Your full name"}
            htmlFor="fullName"
            hint={role === "tutor" ? "Use the name your school knows you by — it goes on your hours record." : undefined}
            error={fe.fullName}
          >
            <Input id="fullName" name="fullName" defaultValue={details.fullName} autoComplete="name" required aria-invalid={Boolean(fe.fullName)} />
          </Field>
          <Field label="Email" htmlFor="email" error={fe.email} hint={role === "family" ? "Use the parent’s email — all lesson updates go here." : undefined}>
            <Input id="email" name="email" type="email" defaultValue={details.email} autoComplete="email" required aria-invalid={Boolean(fe.email)} />
          </Field>
          <Field label="Password" htmlFor="password" error={fe.password} hint="At least 8 characters, with a letter and a number.">
            <Input id="password" name="password" type="password" defaultValue={details.password} autoComplete="new-password" required aria-invalid={Boolean(fe.password)} />
          </Field>
          <div>
            <Checkbox
              name="eligible"
              defaultChecked={details.eligible === "on"}
              required
              aria-invalid={Boolean(fe.eligible)}
              label={
                role === "family"
                  ? "I’m the student’s parent or legal guardian, and I’m 18 or older."
                  : "I’m a high school student in grades 9–12, and my parent or guardian knows I’m volunteering."
              }
            />
            {fe.eligible && <p className="mt-1.5 pl-7 text-[13px] text-clay-700">{fe.eligible}</p>}
          </div>
          {state && !state.ok && !Object.keys(fe).length && <Notice tone="danger">{state.error.message}</Notice>}
          <Submit className="w-full" size="lg" pendingText="Sending code…">
            Continue
          </Submit>
          <p className="text-center text-xs leading-relaxed text-muted">
            By creating an account you agree to the{" "}
            <Link href="/legal/terms" className="underline underline-offset-2" target="_blank">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline underline-offset-2" target="_blank">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      )}
    </form>
  );
}
