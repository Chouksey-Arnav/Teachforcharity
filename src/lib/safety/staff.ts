import { flagsForMessage, type Flag } from "./analyze";

export interface StaffScanMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_side: "admin" | "family";
  body: string;
  created_at: string;
}

/** Staff are adults in a position of trust; apply the tutor-side rules, not tutor actions. */
export function flagsForStaffMessage(message: StaffScanMessage): Flag[] {
  return flagsForMessage({ ...message, sender_side: message.sender_side === "admin" ? "tutor" : "family" }).map((f) => ({
    ...f,
    source_type: "staff_message",
    message_id: null,
    thread_id: null,
    actions: [],
  }));
}
