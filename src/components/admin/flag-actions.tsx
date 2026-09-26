"use client";
import { useState, useTransition } from "react";
import { runScanNow, updateFlag } from "@/app/actions/admin";
import { AdminButton } from "@/components/admin/admin-button";
import { Button } from "@/components/ui/button";

export function FlagActions({ id, status }: { id: number; status: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === "open" ? (
        <>
          <AdminButton label="Handled" variant="primary" askReason reasonPlaceholder="What did you do?" confirmLabel="Mark handled" run={(note) => updateFlag({ id, status: "actioned", note })} />
          <AdminButton label="False alarm" askReason reasonPlaceholder="Why is this fine?" confirmLabel="Dismiss" run={(note) => updateFlag({ id, status: "dismissed", note })} />
        </>
      ) : (
        <AdminButton label="Reopen" variant="ghost" run={() => updateFlag({ id, status: "open" })} />
      )}
    </div>
  );
}

export function RunScanButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button size="sm" pending={pending} onClick={() => start(async () => { const r = await runScanNow(); setMsg(r?.ok ? (r.message ?? "Done") : (r?.error.message ?? "Failed")); })}>
        Run scan now
      </Button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
