"use client";
import { AdminButton } from "@/components/dashboard/admin-button";
import { useState, useTransition } from "react";
import { retryEmail, sendQueuedNow, sendTestEmail } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/errors";

export function EmailActions({ id }: { id: number }) {
  return <AdminButton label="Retry" run={() => retryEmail(id)} />;
}
export function SendNow() {
  return <AdminButton label="Send queued now" variant="primary" run={() => sendQueuedNow()} />;
}

export function TestEmailForm() {
  const [to, setTo] = useState("");
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setRes(await sendTestEmail(to)));
      }}
    >
      <input
        type="email"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="you@example.com"
        className="h-9 w-56 rounded-full border border-line-2 bg-card px-4 text-sm"
        required
      />
      <Button size="sm" type="submit" pending={pending}>
        Send test email
      </Button>
      {res && <span className={`w-full text-xs ${res.ok ? "text-pine-800" : "text-clay-700"}`}>{res.ok ? res.message : res.error.message}</span>}
    </form>
  );
}
