"use client";
import { AdminButton } from "@/components/dashboard/admin-button";
import { retryEmail, sendQueuedNow } from "@/app/actions/admin";

export function EmailActions({ id }: { id: number }) {
  return <AdminButton label="Retry" run={() => retryEmail(id)} />;
}
export function SendNow() {
  return <AdminButton label="Send queued now" variant="primary" run={() => sendQueuedNow()} />;
}
