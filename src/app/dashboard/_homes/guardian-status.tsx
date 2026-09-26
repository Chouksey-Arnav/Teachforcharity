"use client";
import { useState, useTransition } from "react";
import { Hourglass, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { resendGuardianInvite } from "@/app/actions/onboarding";
import { formatRelative } from "@/lib/time";

/** Student account waiting for a parent: shows who we emailed, lets them resend or fix the address. */
export function GuardianStatus({ guardian, deleteOn }: { guardian: { name: string; email: string; last_invited_at: string } | null; deleteOn: string }) {
  const [editing, setEditing] = useState(!guardian);
  const [name, setName] = useState(guardian?.name ?? "");
  const [email, setEmail] = useState(guardian?.email ?? "");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const r = await resendGuardianInvite({ name, email });
      setNote(r?.ok ? { ok: true, text: r.message ?? "Sent!" } : { ok: false, text: r?.error.message ?? "Something went wrong." });
      if (r?.ok) setEditing(false);
    });

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-brass-300/70 bg-brass-50">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-brass-700 ring-1 ring-brass-300/60">
          <Hourglass className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink">Waiting for your parent’s OK</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {guardian ? (
              <>
                We emailed <strong className="break-all">{guardian.email}</strong> {formatRelative(guardian.last_invited_at)}. Once they approve, you can
                message tutors and book lessons. You can look around and pick favorites now.
              </>
            ) : (
              "Add your parent or guardian’s email so they can approve your account."
            )}
          </p>
          <p className="mt-2 text-xs text-muted">If nobody approves by {deleteOn}, this account is deleted automatically.</p>

          {editing ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.3fr_auto] sm:items-end">
              <Field label="Parent’s name" htmlFor="gs-name">
                <Input id="gs-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Parent’s email" htmlFor="gs-email">
                <Input id="gs-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Button onClick={send} pending={pending}>
                <MailCheck className="size-4" /> Send
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={send} pending={pending}>
                Send the email again
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Use a different email
              </Button>
            </div>
          )}
          {note && (
            <Notice tone={note.ok ? "success" : "danger"} className="mt-4">
              {note.text}
            </Notice>
          )}
        </div>
      </div>
    </section>
  );
}
