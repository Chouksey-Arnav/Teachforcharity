"use client";
import { useState, useTransition } from "react";
import { updateIncident, setTutorStatus, hideMessage } from "@/app/actions/admin";
import { AdminButton } from "@/components/dashboard/admin-button";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ActionState } from "@/lib/errors";

export function IncidentControls({
  id,
  status,
  notes,
  tutorId,
  tutorStatus,
  messageId,
}: {
  id: string;
  status: "open" | "reviewing" | "resolved";
  notes: string;
  tutorId: string | null;
  tutorStatus: string | null;
  messageId: string | null;
}) {
  const [s, setS] = useState(status);
  const [n, setN] = useState(notes);
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 border-t border-line bg-paper/50 px-5 py-4">
      <Textarea value={n} onChange={(e) => setN(e.target.value)} rows={2} placeholder="Admin notes (who you spoke with, what was decided)" className="min-h-16 text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <Select value={s} onChange={(e) => setS(e.target.value as typeof s)} className="h-9 text-sm">
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
          </Select>
        </div>
        <Button size="sm" pending={pending} onClick={() => start(async () => setRes(await updateIncident({ id, status: s, notes: n })))}>
          Save
        </Button>
        <span className="mx-1 h-5 w-px bg-line-2" />
        {tutorId && tutorStatus === "active" && (
          <AdminButton label="Pause tutor" askReason confirmLabel="Pause" run={(reason) => setTutorStatus({ tutorId, status: "paused", reason })} />
        )}
        {tutorId && tutorStatus === "paused" && <AdminButton label="Reactivate tutor" variant="primary" run={() => setTutorStatus({ tutorId, status: "active" })} />}
        {tutorId && tutorStatus !== "removed" && (
          <AdminButton label="Remove tutor" variant="danger" askReason confirmLabel="Remove" run={(reason) => setTutorStatus({ tutorId, status: "removed", reason })} />
        )}
        {messageId && <AdminButton label="Hide message" variant="ghost" run={() => hideMessage({ id: messageId, hide: true })} />}
      </div>
      {res && (res.ok ? <Notice tone="success">{res.message}</Notice> : <Notice tone="danger">{res.error.message}</Notice>)}
    </div>
  );
}
