"use client";
import { useActionState, useState, useTransition } from "react";
import { adminSignIn, adminStartEnroll, adminVerifyCode } from "@/app/actions/admin";
import { Field, Input } from "@/components/ui/field";
import { CodeInput, PasswordInput } from "@/components/ui/secret-inputs";
import { Button } from "@/components/ui/button";
import { Submit } from "@/components/ui/submit";
import { Notice } from "@/components/ui/notice";

export function AdminPasswordForm({ next }: { next: string }) {
  const [state, action] = useActionState(adminSignIn, null);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" defaultValue={state?.data?.email} autoFocus required />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      {state && !state.ok && <Notice tone="danger">{state.error.message}</Notice>}
      <Submit className="w-full" pendingText="Checking…">
        Continue
      </Submit>
    </form>
  );
}

export function AdminCodeForm({ next, factorId }: { next: string; factorId?: string }) {
  const [state, action] = useActionState(adminVerifyCode, null);
  const [code, setCode] = useState("");
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {factorId && <input type="hidden" name="factorId" value={factorId} />}
      <Field label="6-digit code" htmlFor="code" error={state && !state.ok ? state.error.message : undefined}>
        <CodeInput id="code" name="code" value={code} onValueChange={setCode} autoSubmit autoFocus required aria-invalid={Boolean(state && !state.ok)} />
      </Field>
      <Submit className="w-full" pendingText="Checking…">
        Verify
      </Submit>
    </form>
  );
}

/** First sign-in: show a QR code for the authenticator app, then check one code to finish setup. */
export function AdminEnroll({ next }: { next: string }) {
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!setup) {
    return (
      <div className="mt-6 space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
          <li>Install an authenticator app on your phone.</li>
          <li>Scan the QR code we show you.</li>
          <li>Type the 6-digit code it gives you.</li>
        </ol>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button
          type="button"
          className="w-full"
          pending={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await adminStartEnroll();
              if (r?.ok && r.data) setSetup(r.data);
              else if (r && !r.ok) setError(r.error.message);
            })
          }
        >
          Show my QR code
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Supabase returns the QR code as an SVG data URI. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR code for your authenticator app" width={176} height={176} className="mx-auto rounded-xl border border-line bg-white p-2" />
      <details className="text-center text-xs text-muted">
        <summary className="cursor-pointer underline-offset-4 hover:underline">Can’t scan it? Enter this key instead</summary>
        <code className="mt-2 block break-all rounded-lg bg-paper-2 px-3 py-2 font-mono text-[13px] tracking-wider text-ink">{setup.secret}</code>
      </details>
      <AdminCodeForm next={next} factorId={setup.factorId} />
    </div>
  );
}
