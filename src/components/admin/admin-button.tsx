"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/errors";

/** A button that runs an admin action, optionally asking for a reason first. */
export function AdminButton({
  label,
  run,
  variant = "secondary",
  askReason,
  reasonPlaceholder = "Reason (recorded in the audit log)",
  confirmLabel,
}: {
  label: string;
  run: (reason: string) => Promise<ActionState>;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  askReason?: boolean;
  reasonPlaceholder?: string;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await run(reason);
      setMsg(r);
      if (r?.ok) {
        setOpen(false);
        setReason("");
      }
    });
  return (
    <span className="inline-flex flex-col gap-1.5">
      {open ? (
        <span className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            className="h-8 w-full rounded-lg sm:w-64 border border-line-2 bg-card px-2.5 text-sm"
          />
          <Button size="sm" variant={variant === "ghost" ? "secondary" : variant} pending={pending} disabled={!reason.trim()} onClick={go}>
            {confirmLabel ?? label}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button size="sm" variant={variant} pending={pending} onClick={() => (askReason ? setOpen(true) : go())}>
          {label}
        </Button>
      )}
      {msg && !msg.ok && <span className="text-xs text-clay-700">{msg.error.message}</span>}
    </span>
  );
}
