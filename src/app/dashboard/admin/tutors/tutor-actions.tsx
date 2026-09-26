"use client";
import { AdminButton } from "@/components/dashboard/admin-button";
import { setTutorStatus } from "@/app/actions/admin";

export function TutorActions({ tutorId, status, onboarded }: { tutorId: string; status: string; onboarded: boolean }) {
  return (
    <>
      {status !== "active" && onboarded && status !== "removed" && (
        <AdminButton label={status === "pending" ? "Approve" : "Reactivate"} variant="primary" run={() => setTutorStatus({ tutorId, status: "active" })} />
      )}
      {status === "removed" && <AdminButton label="Restore (as pending)" run={() => setTutorStatus({ tutorId, status: "pending" })} />}
      {status !== "paused" && status !== "removed" && (
        <AdminButton label="Pause" askReason confirmLabel="Pause tutor" run={(reason) => setTutorStatus({ tutorId, status: "paused", reason })} />
      )}
      {status !== "removed" && (
        <AdminButton label="Remove" variant="danger" askReason confirmLabel="Remove tutor" run={(reason) => setTutorStatus({ tutorId, status: "removed", reason })} />
      )}
    </>
  );
}
