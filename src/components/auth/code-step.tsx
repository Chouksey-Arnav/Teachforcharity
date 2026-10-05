"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { MailCheck } from "lucide-react";
import { resendCode } from "@/app/actions/auth";
import { Field } from "@/components/ui/field";
import { CodeInput } from "@/components/ui/secret-inputs";
import { Notice } from "@/components/ui/notice";

const RESEND_AFTER = 60;

/** The "enter the code we emailed you" block shared by sign-up and password reset. */
export function CodeStep({
  email,
  purpose,
  name,
  error,
  onBack,
  children,
}: {
  email: string;
  purpose: "signup" | "reset";
  name?: string;
  error?: string | null;
  onBack: () => void;
  children?: ReactNode;
}) {
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(RESEND_AFTER);
  const [note, setNote] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pine-50 text-pine-700">
          <MailCheck className="size-5" />
        </span>
        <p className="text-[14.5px] leading-relaxed text-muted">
          {purpose === "reset" ? "If an account exists for " : "We sent a 6-digit code to "}
          <strong className="text-ink">{email}</strong>
          {purpose === "reset" ? ", we sent it a 6-digit code." : "."} It expires in 10 minutes — check spam if you don’t see it.
        </p>
      </div>

      <Field label="Verification code" htmlFor="code" error={error ?? undefined}>
        <CodeInput
          id="code"
          name="code"
          value={code}
          onValueChange={setCode}
          // Sign-up has nothing else to fill in, so finish as soon as the code is complete.
          autoSubmit={purpose === "signup"}
          required
          autoFocus
          aria-invalid={Boolean(error)}
        />
      </Field>

      {children}

      {note && <Notice tone={note.tone}>{note.text}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={onBack} className="text-muted underline-offset-4 hover:text-ink hover:underline">
          ← Use a different email
        </button>
        <button
          type="button"
          disabled={wait > 0 || pending}
          onClick={() =>
            start(async () => {
              setNote(null);
              const r = await resendCode({ email, purpose, name });
              if (r?.ok) {
                setWait(RESEND_AFTER);
                setCode("");
                setNote({ tone: "success", text: r.message ?? "A new code is on its way." });
              } else if (r) {
                setNote({ tone: "danger", text: r.error.message });
              }
            })
          }
          className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
        >
          {pending ? "Sending…" : wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </button>
      </div>
    </div>
  );
}
