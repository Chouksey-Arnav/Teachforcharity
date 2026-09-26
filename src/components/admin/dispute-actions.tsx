"use client";
import { AdminButton } from "@/components/admin/admin-button";
import { resolveDispute } from "@/app/actions/admin";

export function DisputeActions({ sessionId }: { sessionId: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <AdminButton label="It happened" askReason reasonPlaceholder="How was this resolved?" confirmLabel="Mark confirmed" run={(note) => resolveDispute({ sessionId, happened: true, note })} />
      <AdminButton label="It didn’t" variant="danger" askReason reasonPlaceholder="How was this resolved?" confirmLabel="Reject hours" run={(note) => resolveDispute({ sessionId, happened: false, note })} />
    </div>
  );
}
