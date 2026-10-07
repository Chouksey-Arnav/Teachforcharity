"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowLeft, Check, Copy, GraduationCap, Link2, Mail, Music2, PencilLine, RotateCw, Share2, Users } from "lucide-react";
import { requestParentInvite, signUp, verifySignup } from "@/app/actions/auth";
import { createParentInviteLink } from "@/app/actions/public";
import { Button } from "@/components/ui/button";
import { ParentJourney } from "@/components/forms/parent-journey";
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
        {details.role === "family" && <ParentJourney screen={1} className="mb-8" />}
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
              { key: "family", icon: Users, title: "A parent", body: "Signing up my middle schooler" },
              { key: "student", icon: Music2, title: "A student", body: "Grades 6–8, ask a parent" },
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
          {role === "family" && (
            <>
              <ParentJourney screen={0} />
              <p className="rounded-2xl bg-white/60 px-4 py-3 text-[13.5px] leading-relaxed text-muted ring-1 ring-ink/10">
                For North Carolina middle schoolers in grades 6–8. Outside NC, or not in 6th grade yet?{" "}
                <Link href="/waitlist" className="font-semibold text-ink underline underline-offset-4">
                  Join the waitlist
                </Link>
                . Want to look first?{" "}
                <Link href="/#preview" className="font-semibold text-ink underline underline-offset-4">
                  See a sample tutor profile
                </Link>
                .
              </p>
            </>
          )}
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
 * What a middle schooler sees: no account, no password. Their first name and an optional note, then either we email
 * their parent, or they copy a link and text it (lots of 12-year-olds don't know a parent's email, and would rather
 * text anyway). We keep only the name, the note and the parent's email, and delete them after 14 days.
 */
function StudentAskParent() {
  const [state, action] = useActionState(requestParentInvite, null);
  const [sending, startSend] = useTransition();
  // Controlled so a rejected note doesn't wipe what the student typed (React resets forms after an action).
  const [v, setV] = useState({ childFirst: "", parentEmail: "" });
  const [note, setNote] = useState("");
  const [view, setView] = useState<"form" | "sent">("form");
  const [resent, setResent] = useState(false);
  const [link, setLink] = useState<{ url: string } | { error: string; fe?: Record<string, string> } | null>(null);
  const [linking, startLink] = useTransition();
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  const linkFe = link && "error" in link ? link.fe ?? {} : {};

  useEffect(() => {
    if (state?.ok) setView("sent");
  }, [state]);

  const resend = () =>
    startSend(() => {
      const fd = new FormData();
      fd.set("childFirst", v.childFirst);
      fd.set("parentEmail", v.parentEmail);
      if (note.trim()) fd.set("note", note);
      setResent(true);
      action(fd);
    });
  const makeLink = () =>
    startLink(async () => {
      const r = await createParentInviteLink({ childFirst: v.childFirst, note });
      setLink(r?.ok && r.data ? { url: r.data.url } : { error: r && !r.ok ? r.error.message : "Something went wrong.", fe: r && !r.ok ? r.fieldErrors : undefined });
    });

  if (link && "url" in link) return <InviteLink url={link.url} name={v.childFirst} onBack={() => setLink(null)} />;

  if (view === "sent" && state?.ok && state.data) {
    const again = state.data.status === "already_sent";
    return (
      <div className="animate-rise space-y-4">
        <div className="rounded-2xl border border-pine-200 bg-pine-50 p-5" role="status">
          <p className="display text-2xl">{again && resent ? "We just sent one!" : "We emailed your parent!"}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            {again && resent ? (
              <>
                An email went to <strong>{state.data.parentEmail}</strong> a few minutes ago, so we didn’t send another yet. You can send it again in about 10
                minutes.
              </>
            ) : (
              <>
                Ask them to check <strong>{state.data.parentEmail}</strong>, and the spam or promotions folder. The email has a link where they can see what
                the program is{note.trim() ? ", read your note," : ""} and approve you. Then you’ll pick a tutor together.
              </>
            )}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button type="button" variant="secondary" size="sm" pending={sending} onClick={resend}>
            <RotateCw className="size-4" /> Send it again
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setView("form")}>
            <PencilLine className="size-4" /> Fix the email
          </Button>
          <Button type="button" variant="secondary" size="sm" pending={linking} onClick={makeLink}>
            <Link2 className="size-4" /> Copy a link
          </Button>
        </div>
        {link && "error" in link && <Notice tone="danger">{link.error}</Notice>}
        <p className="text-center text-[13px] text-muted">Nothing else to do here. We don’t save anything else about you.</p>
      </div>
    );
  }

  return (
    <div className="animate-rise space-y-5">
      <Notice tone="info" title="A parent signs you up">
        Middle schoolers don’t make their own accounts. Tell us your first name, and we’ll email your parent or guardian, or give you a link to text them.
        We don’t save anything else about you.
      </Notice>
      <Field label="Your first name" htmlFor="childFirst" error={fe.childFirst ?? linkFe.childFirst}>
        <Input
          id="childFirst"
          name="childFirst"
          autoComplete="given-name"
          maxLength={40}
          required
          value={v.childFirst}
          onChange={(e) => setV({ ...v, childFirst: e.target.value })}
          aria-invalid={Boolean(fe.childFirst ?? linkFe.childFirst)}
        />
      </Field>
      <Field
        label="A note to your parent"
        htmlFor="note"
        optional
        error={fe.note ?? linkFe.note}
        hint={`Why you want lessons, in your own words. ${note.length}/${INVITE_NOTE_MAX}`}
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
          aria-invalid={Boolean(fe.note ?? linkFe.note)}
        />
      </Field>
      <Field label="Your parent or guardian’s email" htmlFor="parentEmail" error={fe.parentEmail} hint="Not your own email, theirs. Don’t know it? Copy a link instead.">
        <Input
          id="parentEmail"
          name="parentEmail"
          type="email"
          autoComplete="off"
          value={v.parentEmail}
          onChange={(e) => setV({ ...v, parentEmail: e.target.value })}
          aria-invalid={Boolean(fe.parentEmail)}
        />
      </Field>
      {state && !state.ok && !Object.keys(fe).length && <Notice tone="danger">{state.error.message}</Notice>}
      {link && "error" in link && !Object.keys(linkFe).length && <Notice tone="danger">{link.error}</Notice>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Submit className="w-full" size="lg" pendingText="Sending…" formAction={action}>
          <Mail className="size-4" /> Email my parent
        </Submit>
        <Button type="button" variant="secondary" size="lg" className="w-full" pending={linking} onClick={makeLink}>
          <Link2 className="size-4" /> Copy a link instead
        </Button>
      </div>
    </div>
  );
}

/** The link a student texts their parent. Opens the same page as the emailed invitation, for 14 days. */
function InviteLink({ url, name, onBack }: { url: string; name: string; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="animate-rise space-y-4">
      <div className="rounded-2xl border border-pine-200 bg-pine-50 p-5" role="status">
        <p className="display text-2xl">Here’s your link!</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Text it to your parent or guardian. It opens a page that explains the program and lets them approve {name.trim() || "you"}. It works for 14 days.
          Only send it to your parent.
        </p>
      </div>
      <label htmlFor="invite-link" className="sr-only">
        Your invitation link
      </label>
      <Input id="invite-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[13px]" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" size="lg" className="w-full" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied!" : "Copy link"}
        </Button>
        {canShare ? (
          <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => navigator.share({ title: "Free music lessons", text: `Can you approve my free music lessons?`, url }).catch(() => {})}>
            <Share2 className="size-4" /> Share
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="lg" className="w-full" onClick={onBack}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        )}
      </div>
      {canShare && (
        <button type="button" onClick={onBack} className="block w-full text-center text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          ← Back
        </button>
      )}
    </div>
  );
}
