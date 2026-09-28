import { describe, expect, it } from "vitest";
import { renderEmail } from "./templates";

const evil = `<script>alert("x")</script>`;
const base = {
  recipient_first: evil, student_name: evil, other_name: evil, subject: "Clarinet", when: "Thursday, October 2 at 7:00 PM ET",
  minutes: 45, note: evil, reason: evil, session_id: "00000000-0000-0000-0000-000000000001", thread_id: "t-1",
  meet_url: "https://meet.google.com/abc-defg-hij", start_iso: "2026-10-02T23:00:00Z", end_iso: "2026-10-02T23:45:00Z",
  role: "family", student_grade: 7, family_first: "Pat", guardian_name: evil, guardian_phone: "919-555-0100",
  version: "v1", signed_at: "now", tutor_name: evil, tutor_email: "t@example.test", status: "active", lessons: 2,
  category: "safety", reporter_role: "family", auto_paused: true, incident_id: "i-1", sender_name: evil, grade: 11, school: evil,
};

const TEMPLATES = [
  "session_requested", "session_countered", "session_booked", "session_reminder", "session_declined", "session_cancelled",
  "session_confirm_request", "confirm_reminder", "log_reminder", "new_message", "consent_receipt", "tutor_guardian_notice",
  "tutor_pending_review", "tutor_status_changed", "hours_verified", "hours_rejected", "session_disputed",
  "incident_reported", "incident_received", "new_sign_in",
];

describe("renderEmail", () => {
  it.each(TEMPLATES)("%s renders and escapes user content", (t) => {
    const r = renderEmail(t, base);
    expect(r).not.toBeNull();
    expect(r!.subject.length).toBeGreaterThan(3);
    expect(r!.html).not.toContain("<script>");
    expect(r!.html).toContain("&lt;script&gt;");
    expect(r!.text.length).toBeGreaterThan(10);
  });

  it("tells a parent which child's account signed in, and doesn't offer them a password reset", () => {
    const r = renderEmail("new_sign_in", { ...base, guardian: true, student_name: "Leo", device: "Chrome on iPhone" })!;
    expect(r.subject).toContain("New sign-in");
    expect(r.text).toContain("Leo’s account");
    expect(r.text).toContain("Chrome on iPhone");
    expect(r.html).not.toContain("forgot-password");
  });

  it("account_exists points to sign-in and contains no code", () => {
    const r = renderEmail("account_exists", { recipient_first: "" })!;
    expect(r.html).toContain("/login");
    expect(r.text).not.toMatch(/\b\d{6}\b/);
  });

  it("never includes message bodies in new-message emails", () => {
    const r = renderEmail("new_message", { ...base, body: "SECRET BODY" })!;
    expect(r.html).not.toContain("SECRET BODY");
  });

  it("attaches a calendar invite to booking emails", () => {
    const r = renderEmail("session_booked", base)!;
    expect(r.attachments?.[0].name).toBe("lesson.ics");
    const ics = Buffer.from(r.attachments![0].content, "base64").toString();
    expect(ics).toContain("DTSTART:20261002T230000Z");
    expect(ics).toContain("BEGIN:VEVENT");
  });

  it("returns null for unknown templates so the worker can mark them failed", () => {
    expect(renderEmail("nope", base)).toBeNull();
  });
});

describe("every template the database queues has a renderer", () => {
  it("matches enqueue_email/notify_admins calls in the migrations", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "supabase/migrations");
    const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    const queued = new Set<string>();
    for (const m of sql.matchAll(/(?:enqueue_email|notify_admins)\s*\(/g)) {
      // First snake_case literal after the call is the template name (payload keys come later).
      const lit = sql.slice(m.index! + m[0].length, m.index! + m[0].length + 300).match(/'([a-z]+(?:_[a-z]+)+)'/);
      if (lit && lit[1] !== "recipient_first") queued.add(lit[1]);
    }
    expect(queued.size).toBeGreaterThan(20);
    const missing = [...queued].filter((t) => renderEmail(t, {}) === null);
    expect(missing).toEqual([]);
  });
});
