"use client";
import { useState, useTransition } from "react";
import { Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendTutorGuardianRequest, updateTutorGuardian } from "@/app/actions/onboarding";
import { Field, Input } from "@/components/ui/field";
import { formatRelative } from "@/lib/time";

/** Tutor waiting for their parent's approval: who we emailed, and a resend button. */
export function TutorGuardianStatus({ guardianName, guardianEmail, lastSent }: { guardianName: string; guardianEmail: string; lastSent: string | null }) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(guardianName);
  const [email, setEmail] = useState(guardianEmail);
  const [pending, start] = useTransition();
  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-brass-300/70 bg-brass-50">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-brass-700 ring-1 ring-brass-300/60">
          <Hourglass className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Waiting for your parent’s OK</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            Tutors are minors too, so {guardianName || "your parent or guardian"} needs to approve before families can see you. We emailed{" "}
            <strong>{guardianEmail}</strong>
            {lastSent ? ` ${formatRelative(lastSent)}` : ""} — ask them to check their inbox and spam folder.
          </p>
          {editing && (
            <form
              className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.3fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await updateTutorGuardian({ name, email });
                  setNote(r?.ok ? { ok: true, text: r.message ?? "Sent!" } : { ok: false, text: r?.error.message ?? "Something went wrong." });
                  if (r?.ok) setEditing(false);
                });
              }}
            >
              <Field label="Parent’s name" htmlFor="tgs-name">
                <Input id="tgs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </Field>
              <Field label="Parent’s email" htmlFor="tgs-email">
                <Input id="tgs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Button type="submit" size="sm" pending={pending}>
                Save & send
              </Button>
            </form>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              pending={pending}
              onClick={() =>
                start(async () => {
                  const r = await resendTutorGuardianRequest();
                  setNote(r?.ok ? { ok: true, text: r.message ?? "Sent!" } : { ok: false, text: r?.error.message ?? "Something went wrong." });
                })
              }
            >
              Send the email again
            </Button>
            {!editing && (
              <button type="button" onClick={() => setEditing(true)} className="text-sm text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
                Use a different email
              </button>
            )}
            {note && (
              <span className={note.ok ? "text-sm text-pine-800" : "text-sm text-clay-700"} role="status">
                {note.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
