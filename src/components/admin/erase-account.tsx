"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { eraseAccount } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

/** Privacy/COPPA erasure. Requires a reason and typing ERASE. */
export function EraseAccount({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button size="sm" variant="quiet-danger" onClick={() => setOpen(true)}>
        Erase account…
      </Button>
    );
  return (
    <div className="w-full space-y-2 rounded-xl border border-clay-500/30 bg-clay-50 p-3 sm:max-w-md">
      <p className="text-sm text-clay-800">
        Permanently erase <strong>{name}</strong>. With no lesson history the account is deleted. Otherwise names, contact details and messages are
        removed, sign-in is disabled, and only lesson dates stay (for tutors’ hour records).
      </p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. parent request by email on 9/28)" className="h-9 text-sm" />
      <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type ERASE" className="h-9 text-sm" />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="danger"
          pending={pending}
          disabled={confirm !== "ERASE" || reason.trim().length < 3}
          onClick={() =>
            start(async () => {
              const r = await eraseAccount({ userId, reason, confirm });
              setMsg(r?.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r?.error.message ?? "Failed." });
              if (r?.ok) router.push("/admin/people");
            })
          }
        >
          Erase permanently
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice>}
    </div>
  );
}
