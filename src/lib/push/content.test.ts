import { describe, expect, it } from "vitest";
import { pushContent } from "./content";

const sid = "0b0c9f5e-1d2a-4b8e-9c3a-6f5e4d3c2b1a";

describe("pushContent", () => {
  it("never puts message text or a Meet link on the lock screen", () => {
    const c = pushContent("new_message", { sender_name: "Maya R.", student_name: "Leo", thread_id: sid, body: "secret text", meet_url: "https://meet.google.com/x" })!;
    expect(c.title).toBe("New message from Maya R.");
    expect(JSON.stringify(c)).not.toMatch(/secret text|meet\.google/);
    expect(c.url).toBe(`/dashboard/messages/${sid}`);
  });

  it("only links inside the site, even with a hostile payload", () => {
    const c = pushContent("new_message", { sender_name: "x", thread_id: "../../evil.com" })!;
    expect(c.url).toBe("/dashboard/messages");
    const r = pushContent("session_reminder", { subject: "Flute", when: "Mon", session_id: "https://evil.com" })!;
    expect(r.url.startsWith("/dashboard/lessons")).toBe(true);
  });

  it("describes weekly series once", () => {
    const c = pushContent("session_requested", { subject: "Clarinet", student_name: "Leo", weeks: 4, weekly: "Thursdays at 5:00 PM ET", when: "Thu" })!;
    expect(c.title).toBe("Weekly Clarinet lessons requested");
    expect(c.body).toContain("Thursdays at 5:00 PM ET");
  });

  it("skips emails that aren't for the device's owner, and non-urgent ones", () => {
    expect(pushContent("session_booked", { role: "guardian", subject: "Flute" })).toBeNull();
    expect(pushContent("weekly_digest", {})).toBeNull();
    expect(pushContent("verification_code", { code: "123456" })).toBeNull();
    expect(pushContent("new_sign_in", {})).toBeNull();
  });

  it("caps long names", () => {
    const c = pushContent("new_message", { sender_name: "A".repeat(500) })!;
    expect(c.title.length).toBeLessThan(120);
  });
});
