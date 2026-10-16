import { describe, expect, it } from "vitest";
import { lessonBadge, type LessonLike } from "./lesson-state";

const now = Date.parse("2026-10-16T18:00:00Z");
const base: LessonLike = {
  status: "scheduled",
  my_side: "family",
  awaiting_me: false,
  end_at: "2026-10-20T22:45:00Z",
  tutor_name: "Jordan L.",
  student_name: "Leo",
  family_attendance: null,
};

describe("lessonBadge", () => {
  it("tells a family whose turn a request is", () => {
    expect(lessonBadge({ ...base, status: "pending" }, now).label).toBe("Waiting for Jordan");
    expect(lessonBadge({ ...base, status: "pending", awaiting_me: true }, now).label).toBe("Your turn");
    expect(lessonBadge({ ...base, status: "pending", my_side: "tutor" }, now).label).toBe("Waiting for Leo");
  });

  it("asks a family about a lesson that just ended, then says done", () => {
    const past = { ...base, end_at: "2026-10-15T22:45:00Z" };
    expect(lessonBadge(base, now).label).toBe("Booked");
    expect(lessonBadge(past, now).label).toBe("Did Jordan show up?");
    expect(lessonBadge({ ...past, status: "completed" }, now).label).toBe("Did Jordan show up?");
    expect(lessonBadge({ ...past, status: "completed", family_attendance: "present" }, now).label).toBe("Done");
    for (const status of ["confirmed", "verified", "rejected"]) expect(lessonBadge({ ...past, status }, now).label).toBe("Done");
  });

  it("never shows a family the partner-certification steps, but the tutor keeps them", () => {
    expect(lessonBadge({ ...base, status: "verified" }, now).label).toBe("Done");
    expect(lessonBadge({ ...base, status: "verified", my_side: "tutor" }, now).label).toBe("Certified by partner");
  });

  it("says plainly why something isn't happening", () => {
    expect(lessonBadge({ ...base, status: "expired" }, now).label).toBe("Ran out of time");
    expect(lessonBadge({ ...base, status: "declined" }, now).label).toBe("Not booked");
    expect(lessonBadge({ ...base, status: "disputed" }, now)).toEqual({ label: "You said Jordan wasn’t there", tone: "clay" });
  });
});
