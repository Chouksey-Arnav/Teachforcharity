"use client";
import { AdminButton } from "@/components/admin/admin-button";
import { hideMessage, hidePractice } from "@/app/actions/admin";

export function HideToggle({ id, hidden }: { id: string; hidden: boolean }) {
  return <AdminButton label={hidden ? "Unhide" : "Hide"} variant="ghost" run={() => hideMessage({ id, hide: !hidden })} />;
}

/** For a flagged practice task or note: take it off the student's board (or put it back). */
export function PracticeHideToggle({ id }: { id: string }) {
  return (
    <>
      <AdminButton label="Hide from board" variant="ghost" run={() => hidePractice({ id, hide: true })} />
      <AdminButton label="Restore" variant="ghost" run={() => hidePractice({ id, hide: false })} />
    </>
  );
}
