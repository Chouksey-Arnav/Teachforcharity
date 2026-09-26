"use client";
import { useState, useTransition } from "react";
import { revokeConsent } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";

export function RevokeConsentButton({ studentId, name }: { studentId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span className="text-xs text-muted">{msg}</span>;
  return confirming ? (
    <span className="flex items-center gap-2">
      <span className="text-xs text-muted">Cancel {name}’s upcoming lessons?</span>
      <Button size="sm" variant="danger" pending={pending} onClick={() => start(async () => {
        const r = await revokeConsent(studentId);
        setMsg(r?.ok ? (r.message ?? "Withdrawn.") : r ? r.error.message : "Error");
      })}>
        Withdraw
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className="text-xs text-muted underline-offset-2 hover:text-clay-700 hover:underline">
      Withdraw consent
    </button>
  );
}
