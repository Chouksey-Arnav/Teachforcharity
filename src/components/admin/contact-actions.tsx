"use client";
import { AdminButton } from "./admin-button";
import { removeWaitlistEntry, setContactStatus } from "@/app/actions/admin";

export function ContactStatusButton({ id, status }: { id: string; status: "new" | "handled" }) {
  return status === "new" ? (
    <AdminButton label="Mark handled" variant="primary" run={() => setContactStatus({ id, status: "handled" })} />
  ) : (
    <AdminButton label="Move back to new" variant="ghost" run={() => setContactStatus({ id, status: "new" })} />
  );
}

export function RemoveWaitlistButton({ id }: { id: string }) {
  return <AdminButton label="Remove" variant="ghost" run={() => removeWaitlistEntry(id)} />;
}
