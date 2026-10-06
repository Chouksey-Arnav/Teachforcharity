"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { GraduationCap, Music2, Users } from "lucide-react";
import { requestParentInvite, signUp, verifySignup } from "@/app/actions/auth";
import { CodeStep } from "@/components/auth/code-step";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/secret-inputs";
import { Submit } from "@/components/ui/submit";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import { INVITE_NOTE_MAX } from "@/lib/constants";

export type Role = "student" | "family" | "tutor";

export function SignupForm({ initialRole, invitedEmail, invitedChild }: { initialRole: Role | null; invitedEmail?: string; invitedChild?: string }) {
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
          ...(fd.get("invitedChild") ? { invitedChild: String(fd.get("invitedChild")) } : {}),
        });
        action(fd);
      }}
      className="mt-8 space-y-6"
      noValidate
    >
      <fieldset>
        <legend className="mb-3 text-sm font-medium">I’m signing up as…</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              { key: "student", icon: Music2, title: "A student", body: "Grades 6–8, ask a parent" },
              { key: "family", icon: Users, title: "A parent", body: "Signing up my middle schooler" },
              { key: "tutor", icon: GraduationCap, title: "A tutor", body: "Grades 9–12, I want to teach" },
            ] as const
          ).map(({ key, icon: Icon, title, body }) => (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-4 transition sm:flex-col sm:items-start sm:gap-0",
                role === key ? "border-ink bg-white ring-4 ring-glow/45" : "border-line hover:border-line-2",
              )}
            >
              <input type="radio" name="role" value={key} checked={role === key} onChange={() => setRole(key)} className="sr-only" />
              <Icon className={cn("size-5 shrink-0", role === key ? "text-pine-700" : "text-muted")} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold sm:mt-3">{title}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{body}</span>
              </span>
            </label>
          ))}
        </div>
        {fe.role && <p className="mt-2 text-[13px] text-clay-700">Choose one to continue.</p>}
      </fieldset>

      {role && role !== "student" && (
        <div className="animate-rise space-y-5">
          {role === "family" && invitedChild && (
            <Notice tone="info" title={`${invitedChild} asked you to sign them up`}>
              Create your parent account, then add {invitedChild} and sign the consent form. It takes about five minutes.
            </Notice>
          )}
          {role === "family" && invitedChild && <input type="hidden" name="invitedChild" value={invitedChild} />}
          <Field
            label={role === "family" ? "Your name (parent or guardian)" : "Your full name"}
            htmlFor="fullName"
            hint={
              role === "tutor" ? "Use the name your school knows you by — it goes on your hours record." : undefined
            }
            error={fe.fullName}
          >
            <Input
              id="fullName"
              name="fullName"
              defaultValue={details.fullName}
              autoComplete="name"
              maxLength={120}
              required
              aria-invalid={Boolean(fe.fullName)}
            />
          </Field>
          <Field
            label="Email"
            htmlFor="email"
            error={fe.email}
            hint={
              role === "family" ? "Use the parent’s email — all lesson updates go here." : undefined
            }
          >
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={details.email ?? (role === "family" ? invitedEmail : undefined)}
              autoComplete="email"
              required
              aria-invalid={Boolean(fe.email)}
            />
          </Field>
          <Field label="Password" htmlFor="password" error={fe.password} hint="At least 8 characters, with a letter and a number.">
            <PasswordInput id="password" name="password" defaultValue={details.password} autoComplete="new-password" required aria-invalid={Boolean(fe.password)} />
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
                  : "I’m a high school student in grades 9–12, and I’ll ask my parent or guardian to approve my volunteering."
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
      {role === "student" && <StudentAskParent />}
    </form>
  );
}

/**
 * What a middle schooler sees: no account, no password — just their first
 * name, a parent's email and an optional note, so we can invite the parent.
 */
function StudentAskParent() {
  const [state, action] = useActionState(requestParentInvite, null);
  // Controlled so a rejected note doesn't wipe what the student typed (React resets forms after an action).
  const [v, setV] = useState({ childFirst: "", parentEmail: "" });
  const [note, setNote] = useState("");
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  if (state?.ok && state.data) {
    return (
      <div className="animate-rise rounded-2xl border border-pine-200 bg-pine-50 p-5" role="status">
        <p className="display text-2xl">We emailed your parent!</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Ask them to check <strong>{state.data.parentEmail}</strong> (and the spam folder). The email has a link where they can see what the program
          is{note.trim() ? ", read your note," : ""} and approve you. Then you’ll pick a tutor together. There’s nothing else you need to do here.
        </p>
      </div>
    );
  }
  return (
    <div className="animate-rise space-y-5">
      <Notice tone="info" title="A parent signs you up">
        Middle schoolers don’t make their own accounts. Tell us your first name and your parent or guardian’s email, and we’ll send them a link to
        approve you. We don’t save anything else about you.
      </Notice>
      <Field label="Your first name" htmlFor="childFirst" error={fe.childFirst}>
        <Input
          id="childFirst"
          name="childFirst"
          autoComplete="given-name"
          maxLength={40}
          required
          value={v.childFirst}
          onChange={(e) => setV({ ...v, childFirst: e.target.value })}
          aria-invalid={Boolean(fe.childFirst)}
        />
      </Field>
      <Field label="Your parent or guardian’s email" htmlFor="parentEmail" error={fe.parentEmail} hint="Not your own email — theirs.">
        <Input
          id="parentEmail"
          name="parentEmail"
          type="email"
          autoComplete="off"
          required
          value={v.parentEmail}
          onChange={(e) => setV({ ...v, parentEmail: e.target.value })}
          aria-invalid={Boolean(fe.parentEmail)}
        />
      </Field>
      <Field
        label="A note to your parent"
        htmlFor="note"
        optional
        error={fe.note}
        hint={`Why you want lessons, in your own words. It goes in the email. ${note.length}/${INVITE_NOTE_MAX}`}
      >
        <Textarea
          id="note"
          name="note"
          rows={3}
          maxLength={INVITE_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="I really want to get better at trumpet before the spring concert!"
          className="min-h-20"
          aria-invalid={Boolean(fe.note)}
        />
      </Field>
      {state && !state.ok && !Object.keys(fe).length && <Notice tone="danger">{state.error.message}</Notice>}
      <Submit className="w-full" size="lg" pendingText="Sending…" formAction={action}>
        Email my parent
      </Submit>
    </div>
  );
}
