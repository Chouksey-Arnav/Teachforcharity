"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyConsent } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ActionState } from "@/lib/errors";

/** Record the outcome of a verification call. A note is required either way. */
export function ConsentCallControls({ consentId, guardianName }: { consentId: string; guardianName: string }) {
  const [note, setNote] = useState("");
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  // Leave the outcome on screen for a moment, then drop the card from the list.
  useEffect(() => {
    if (!res?.ok) return;
    const t = setTimeout(() => router.refresh(), 2500);
    return () => clearTimeout(t);
  }, [res, router]);
  const decide = (verified: boolean) => {
    if (!verified && !window.confirm(`Withdraw this consent? ${guardianName} will be emailed and any requests cancelled.`)) return;
    start(async () => setRes(await verifyConsent({ consentId, verified, note })));
  };
  if (res?.ok) return <Notice tone="success" className="m-4">{res.message}</Notice>;
  return (
    <div className="space-y-3 border-t border-line bg-paper/50 px-5 py-4">
      <label className="block text-[13px] font-medium" htmlFor={`note-${consentId}`}>
        Call notes
      </label>
      <Textarea
        id={`note-${consentId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="e.g. Spoke with Dana (mother) at 4:10 PM, confirmed she signed and understands lessons are online only."
        className="min-h-16 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" pending={pending} disabled={note.trim().length < 3} onClick={() => decide(true)}>
          Verified — it was the parent
        </Button>
        <Button size="sm" variant="danger" pending={pending} disabled={note.trim().length < 3} onClick={() => decide(false)}>
          Couldn’t verify
        </Button>
      </div>
      {res && !res.ok && <Notice tone="danger">{res.error.message}</Notice>}
    </div>
  );
}
