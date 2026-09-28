"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmByLink } from "@/app/actions/confirm-link";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ActionState } from "@/lib/errors";

export function ConfirmChoices({ token, tutorName }: { token: string; tutorName: string }) {
  const router = useRouter();
  const [no, setNo] = useState(false);
  const [note, setNote] = useState("");
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const send = (happened: boolean) =>
    start(async () => {
      const r = await confirmByLink({ token, happened, note: note || undefined });
      setRes(r);
      if (r?.ok) router.refresh();
    });
  if (res?.ok) return <Notice tone="success" className="mt-6">{res.message}</Notice>;
  return (
    <div className="mt-6 space-y-4">
      {!no ? (
        <div className="flex flex-wrap gap-3">
          <Button size="lg" pending={pending} onClick={() => send(true)}>
            <CheckCircle2 className="size-4" /> Yes, it happened
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setNo(true)}>
            No, it didn’t
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="What happened?" htmlFor="cl-note" hint={`This goes to the program team, not to ${tutorName}. No contact info, please.`}>
            <Textarea id="cl-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} autoFocus />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" pending={pending} disabled={note.trim().length < 3} onClick={() => send(false)}>
              Report that it didn’t happen
            </Button>
            <Button variant="ghost" onClick={() => setNo(false)}>
              Back
            </Button>
          </div>
        </div>
      )}
      {res && !res.ok && <Notice tone="danger">{res.error.message}</Notice>}
      <p className="text-xs text-muted">If something about the lesson made you uncomfortable, please also report a concern from your dashboard or parent page.</p>
    </div>
  );
}
