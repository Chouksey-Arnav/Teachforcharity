"use client";
import { useState, useTransition } from "react";
import { reviewHours } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/** Select-all + verify/reject for confirmed lessons. Rejecting requires a reason (the tutor sees it). */
export function VerifyHours({ ids }: { ids: string[] }) {
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const selected = () =>
    Array.from(document.querySelectorAll<HTMLInputElement>('input[name="verify"]:checked'))
      .map((i) => i.value)
      .filter((v) => ids.includes(v));
  const run = (approve: boolean) =>
    start(async () => {
      const r = await reviewHours({ ids: selected(), approve, note: approve ? undefined : reason });
      setMsg(r?.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r?.error.message ?? "Failed." });
    });
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper-2/40 px-4 py-2.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          onChange={(e) => document.querySelectorAll<HTMLInputElement>('input[name="verify"]').forEach((i) => (i.checked = e.target.checked))}
        />
        Select all
      </label>
      <Button size="sm" pending={pending} onClick={() => run(true)}>
        Verify selected
      </Button>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (needed to reject)" className="h-8 min-w-0 flex-1 rounded-lg border border-line-2 bg-card px-2.5 text-sm sm:max-w-xs" />
      <Button size="sm" variant="quiet-danger" pending={pending} disabled={!reason.trim()} onClick={() => run(false)}>
        Reject selected
      </Button>
      {msg && <Notice tone={msg.ok ? "success" : "danger"} className="w-full py-1.5">{msg.text}</Notice>}
    </div>
  );
}
