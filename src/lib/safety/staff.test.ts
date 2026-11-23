import { describe, expect, it } from "vitest";
import { flagsForStaffMessage, type StaffScanMessage } from "./staff";

const message = (body: string, sender_side: "admin" | "family"): StaffScanMessage => ({
  id: "staff-message", thread_id: "staff-thread", sender_id: "author", sender_side, body, created_at: "2026-11-23T12:00:00Z",
});

describe("staff communication safety", () => {
  it("flags a family harm disclosure without hiding it or using tutor foreign keys", () => {
    const flags = flagsForStaffMessage(message("I want to kill myself", "family"));
    expect(flags).toEqual(expect.arrayContaining([expect.objectContaining({
      source_type: "staff_message", source_id: "staff-message", author_id: "author", category: "self_harm", severity: "critical", message_id: null, thread_id: null, actions: [],
    })]));
  });

  it("checks privileged staff messages without tutor actions", () => {
    const flags = flagsForStaffMessage(message("don't tell your parents about our lessons", "admin"));
    expect(flags).toEqual(expect.arrayContaining([expect.objectContaining({ category: "grooming_secrecy", severity: "critical" })]));
    expect(flags.every((f) => f.actions.length === 0 && f.message_id === null && f.thread_id === null)).toBe(true);
  });

  it("does not flag routine staff messages", () => {
    expect(flagsForStaffMessage(message("Your lesson is scheduled for tomorrow", "admin"))).toEqual([]);
  });
});
