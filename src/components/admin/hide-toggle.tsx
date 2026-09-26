"use client";
import { AdminButton } from "@/components/admin/admin-button";
import { hideMessage } from "@/app/actions/admin";

export function HideToggle({ id, hidden }: { id: string; hidden: boolean }) {
  return <AdminButton label={hidden ? "Unhide" : "Hide"} variant="ghost" run={() => hideMessage({ id, hide: !hidden })} />;
}
