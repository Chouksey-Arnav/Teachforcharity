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
  "tutor_guardian_request", "tutor_guardian_approved", "tutor_guardian_withdrew", "waitlist_match", "weekly_digest",
  "practice_assigned",
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

  it("parent invites escape the child's name and note, link to the invitation page and keep the child's details out of the footer", () => {
    const r = renderEmail("parent_invite", { child_first: evil, parent_email: "mom@example.test", has_account: false, note: evil, token: "ab".repeat(32) })!;
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain(`/invite/${"ab".repeat(32)}`);
    expect(r.text).toContain("wrote you a note");
    const plain = renderEmail("parent_invite", { child_first: "Leo", parent_email: "mom@example.test", has_account: false, note: null, token: "cd".repeat(32) })!;
    expect(plain.text).not.toContain("wrote you a note");
    // Emails queued before invitation pages existed still work.
    const legacy = renderEmail("parent_invite", { child_first: "Leo", parent_email: "mom@example.test", has_account: false })!;
    expect(legacy.html).toContain("/signup?role=family&amp;email=mom%40example.test");
    const existing = renderEmail("parent_invite", { child_first: "Leo", parent_email: "mom@example.test", has_account: true })!;
    expect(existing.html).toContain("/dashboard/students/new");
  });

  it("consent receipts never promise a phone call", () => {
    const r = renderEmail("consent_receipt", { ...base, verification: true })!;
    expect(r.text).not.toMatch(/will call you|phone check/i);
    expect(r.text).toContain("unlocked");
  });

  it("account_exists points to sign-in and contains no code", () => {
    const r = renderEmail("account_exists", { recipient_first: "" })!;
    expect(r.html).toContain("/login");
    expect(r.text).not.toMatch(/\b\d{6}\b/);
  });

  it("never puts the Meet link in lesson emails or calendar invites, even if one is passed", () => {
    for (const t of ["session_booked", "session_reminder"]) {
      const r = renderEmail(t, base)!;
      expect(r.html).not.toContain("meet.google.com");
      expect(r.text).not.toContain("meet.google.com");
      for (const a of r.attachments ?? []) expect(Buffer.from(a.content, "base64").toString()).not.toContain("meet.google.com");
    }
  });

  it("weekly series emails describe every week and attach one calendar event per lesson", () => {
    const dates = [0, 7, 14, 21].map((d, i) => ({
      start_iso: new Date(Date.UTC(2026, 9, 1 + d, 21)).toISOString(),
      end_iso: new Date(Date.UTC(2026, 9, 1 + d, 21, 45)).toISOString(),
      session_id: `s-${i}`,
    }));
    const series = { ...base, weeks: 4, weekly: "Thursdays at 5:00 PM ET", until: "Thursday, October 22 at 5:00 PM ET", dates };
    const booked = renderEmail("session_booked", series)!;
    expect(booked.subject).toBe("Booked: 4 weekly Clarinet lessons, Thursdays at 5:00 PM ET");
    expect(booked.text).toContain("Thursdays at 5:00 PM ET, 4 weeks");
    const ics = Buffer.from(booked.attachments![0].content, "base64").toString();
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(ics).toContain("UID:s-3@teachforacause");
    expect(renderEmail("session_requested", series)!.subject).toContain("weekly Clarinet lessons");
    expect(renderEmail("session_cancelled", { ...base, count: 3 })!.subject).toContain("3 Clarinet lessons");
  });

  it("confirmation emails carry a signed one-tap link and the practice notes", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    const r = renderEmail("session_confirm_request", { ...base, session_id: "0b0c9f5e-1d2a-4b8e-9c3a-6f5e4d3c2b1a", practice: "Scales in F, 10 min a day" })!;
    expect(r.html).toMatch(/\/confirm\/0b0c9f5e-1d2a-4b8e-9c3a-6f5e4d3c2b1a\.\d+\./);
    expect(r.text).toContain("Scales in F, 10 min a day");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const plain = renderEmail("confirm_reminder", { ...base, session_id: "0b0c9f5e-1d2a-4b8e-9c3a-6f5e4d3c2b1a" })!;
    expect(plain.html).not.toContain("/confirm/");
    expect(plain.html).toContain("/dashboard/lessons");
  });

  it("the weekly summary lists lessons, practice and what needs confirming", () => {
    const r = renderEmail("weekly_digest", {
      recipient_first: "Dana", student_name: "Leo", messages: 3, to_confirm: 1,
      past: [{ when: "Thu, Oct 1 at 5:00 PM ET", subject: "Clarinet", tutor: "Maya R.", status: "completed", practice: "Long tones" }],
      upcoming: [{ when: "Thu, Oct 8 at 5:00 PM ET", subject: "Clarinet", tutor: "Maya R." }],
    })!;
    expect(r.text).toContain("waiting for your confirmation");
    expect(r.text).toContain("Long tones");
    expect(r.text).toContain("Coming up: Clarinet with Maya R.");
    expect(r.text).toContain("1 lesson needs your confirmation");
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

  it("waitlist emails carry a removal link and say they're the only one", () => {
    const r = renderEmail("interest_match", { subject: "Trumpet", exact: true, leave_token: "a".repeat(32) })!;
    expect(r.html).toContain(`/waitlist/leave/${"a".repeat(32)}`);
    expect(r.text).toContain(`/waitlist/leave/${"a".repeat(32)}`);
    expect(r.html).toContain("only email");
    expect(renderEmail("interest_match", { subject: "Clarinet", exact: false, leave_token: "b".repeat(32) })!.html).toContain("closely related");
  });

  it("contact alerts never include the message itself", () => {
    const r = renderEmail("contact_message", { topic: "concern", message: "secret details", message_id: "m-1" })!;
    expect(r.subject).toMatch(/URGENT/);
    expect(r.html).not.toContain("secret details");
    expect(r.html).toContain("/admin/inbox");
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
    // Phone checks were retired (20261007000100_email_verified_consent.sql); queued copies were marked failed there.
    const retired = new Set(["consent_pending", "consent_verified", "consent_not_verified"]);
    const missing = [...queued].filter((t) => !retired.has(t) && renderEmail(t, {}) === null);
    expect(missing).toEqual([]);
  });
});
