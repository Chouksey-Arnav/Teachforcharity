import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { dayBucket, describeUpdate, safeUpdateHref, type UpdateRow } from "./updates";

const sid = "0b0c9f5e-1d2a-4b8e-9c3a-6f5e4d3c2b1a";
const row = (kind: string, payload: Record<string, unknown>, extra: Partial<UpdateRow> = {}): UpdateRow => ({
  id: 1, kind, area: "messages", payload, count: 1, created_at: "2026-10-12T15:00:00Z", updated_at: "2026-10-12T15:00:00Z", read_at: null, ...extra,
});
const parent = { role: "family", isStudent: false };
const student = { role: "family", isStudent: true };
const tutor = { role: "tutor", isStudent: false };

// Every kind the database can create (src: supabase/migrations/20261012000100_updates.sql).
const KINDS = [
  "message", "practice", "lesson_confirmed", "lesson_disputed", "session_proposed", "session_requested", "session_countered",
  "session_booked", "session_reminder", "session_declined", "session_cancelled", "session_confirm_request", "confirm_reminder",
  "log_reminder", "hours_verified", "hours_rejected", "tutor_offer", "waitlist_match", "consent_receipt", "guardian_approved",
  "tutor_guardian_approved", "tutor_status_changed", "incident_received",
];

describe("describeUpdate", () => {
  it("rolls messages up in plain words and opens the conversation", () => {
    const v = describeUpdate(row("message", { sender_name: "Maya P.", student_name: "Leo", thread_id: sid }, { count: 3, preview: "See you Thursday!" }), parent);
    expect(v.title).toBe("Maya P. sent you 3 messages");
    expect(v.detail).toBe("“See you Thursday!”");
    expect(v.href).toBe(`/dashboard/messages/${sid}`);
    expect(v.cta).toBe("Read");
    expect(describeUpdate(row("message", { sender_name: "Maya P.", thread_id: sid }), parent).title).toBe("Maya P. sent you a message");
  });

  it("speaks to a student as 'you' and to a parent about their child", () => {
    expect(describeUpdate(row("practice", { tutor_name: "Maya P.", student_name: "Leo", self: true, tasks: 2 }), student).title).toBe("Maya P. gave you new practice");
    expect(describeUpdate(row("practice", { tutor_name: "Maya P.", student_name: "Leo", tasks: 2, note: true }), parent)).toMatchObject({
      title: "Maya P. gave Leo new practice",
      detail: "2 tasks and a note on the Practice board.",
    });
    expect(describeUpdate(row("session_confirm_request", { student_name: "Leo", other_name: "Maya P.", session_id: sid }), student).title).toBe("Was Maya P. at your lesson?");
    expect(describeUpdate(row("session_confirm_request", { student_name: "Leo", other_name: "Maya P.", session_id: sid }), parent).title).toBe("Did Leo’s lesson happen?");
  });

  it("tells the tutor what the family answered", () => {
    expect(describeUpdate(row("lesson_confirmed", { student_name: "Leo", subject: "Clarinet", when: "Mon" }), tutor)).toMatchObject({ title: "Leo’s family confirmed you were there", tone: "good" });
    expect(describeUpdate(row("lesson_confirmed", { student_name: "Leo", self: true }), tutor).title).toBe("Leo confirmed you were there");
    expect(describeUpdate(row("lesson_disputed", { student_name: "Leo", session_id: sid }), tutor)).toMatchObject({ tone: "bad", href: `/dashboard/lessons?focus=${sid}` });
  });

  it("sends anything that needs an answer to the answer screen", () => {
    for (const k of ["session_requested", "session_countered", "session_proposed", "session_confirm_request", "confirm_reminder", "log_reminder"])
      expect(describeUpdate(row(k, { session_id: sid }), tutor).href).toBe("/dashboard/lessons?tab=action");
  });

  it("words every kind with a title, a button and a dashboard link — whatever the payload", () => {
    fc.assert(
      fc.property(fc.constantFrom(...KINDS), fc.dictionary(fc.string(), fc.anything()), fc.constantFrom(parent, student, tutor), (kind, payload, viewer) => {
        const v = describeUpdate(row(kind, payload), viewer);
        expect(v.title.length).toBeGreaterThan(0);
        expect(v.title).not.toMatch(/undefined|null|NaN|\[object/);
        expect(v.cta.length).toBeGreaterThan(0);
        expect(safeUpdateHref(v.href)).toBe(v.href);
      }),
    );
  });

  it("never builds a link from untrusted ids", () => {
    const v = describeUpdate(row("message", { thread_id: "../../evil.com" }), parent);
    expect(v.href).toBe("/dashboard/messages");
    expect(describeUpdate(row("session_booked", { session_id: "https://evil.com" }), parent).href).toBe("/dashboard/lessons");
  });

  it("falls back safely for kinds it doesn't know", () => {
    expect(describeUpdate(row("something_new", {}), parent)).toMatchObject({ href: "/dashboard", cta: "Open" });
  });
});

describe("safeUpdateHref", () => {
  it("only allows dashboard paths", () => {
    expect(safeUpdateHref("/dashboard/lessons?tab=action")).toBe("/dashboard/lessons?tab=action");
    expect(safeUpdateHref("/dashboard")).toBe("/dashboard");
    for (const bad of ["https://evil.com", "//evil.com", "/dashboardx", "/admin", "javascript:alert(1)"]) expect(safeUpdateHref(bad)).toBe("/dashboard/updates");
  });
});

describe("dayBucket", () => {
  const now = new Date("2026-10-12T16:00:00Z"); // noon Eastern, Monday
  it("groups in Eastern time", () => {
    expect(dayBucket("2026-10-12T05:00:00Z", now)).toBe("Today"); // 1 AM ET
    expect(dayBucket("2026-10-12T03:00:00Z", now)).toBe("Yesterday"); // 11 PM ET Sunday
    expect(dayBucket("2026-10-09T16:00:00Z", now)).toBe("Earlier this week");
    expect(dayBucket("2026-09-30T16:00:00Z", now)).toBe("Older");
  });
});

describe("teachership updates", () => {
  const row = (kind: string, payload: Record<string, unknown>) => ({ id: 1, kind, area: "lessons", payload, count: 1, created_at: "", updated_at: "", read_at: null });
  const family = { role: "family", isStudent: false };
  const tutor = { role: "tutor", isStudent: false };

  it("tells a family a request ran out of time and where to go next", () => {
    const v = describeUpdate(row("session_expired", { other_name: "Jordan L.", subject: "Clarinet", when: "Thu 5 PM", waiting_on_you: false }), family);
    expect(v.title).toBe("No answer from Jordan L. in time");
    expect(v.href).toBe("/dashboard/tutors");
  });

  it("asks for an answer to a move and says the lesson stays put otherwise", () => {
    const v = describeUpdate(row("session_moved", { outcome: "requested", other_name: "Leo", subject: "Clarinet", when: "Fri 5 PM", session_id: "00000000-0000-0000-0000-000000000001" }), tutor);
    expect(v.cta).toBe("Answer");
    expect(v.detail).toContain("stays at the old time");
  });

  it("tells a tutor a student booked an open time", () => {
    expect(describeUpdate(row("session_booked", { instant: true, student_name: "Leo", subject: "Clarinet", when: "Fri 5 PM" }), tutor).title).toBe("Leo booked a lesson with you");
  });
});

