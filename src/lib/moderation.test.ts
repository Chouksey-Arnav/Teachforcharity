import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { messageViolation, violationSpans } from "./moderation";

// The same vectors are exercised against private.message_violation() in
// supabase/tests/e2e_program_test.sql, so the two filters stay aligned.
describe("messageViolation", () => {
  const blocked: [string, string][] = [
    ["my number is (919) 555-1234", "phone numbers"],
    ["call 919.555.1234", "phone numbers"],
    ["+1 919 555 1234", "phone numbers"],
    ["email me: kid@gmail.com", "email addresses"],
    ["leo at gmail dot com", "email addresses"],
    ["add me on snapchat", "outside apps, social media, or payment apps"],
    ["can we just use zoom", "outside apps, social media, or payment apps"],
    ["venmo me", "outside apps, social media, or payment apps"],
    ["check www.example.com", "links"],
    ["https://evil.test/x", "links"],
    ["go to mysite.com", "links"],
    ["dm @leo_plays", "social media handles"],
    ["come over to my house", "in-person meetups (lessons are online only)"],
    ["let's meet in person", "in-person meetups (lessons are online only)"],
    ["this is shit", "language that is not allowed"],
  ];
  it.each(blocked)("blocks %s", (text, reason) => {
    expect(messageViolation(text)).toBe(reason);
  });

  const allowed = [
    "Leo practiced measures 12-24 for 20 minutes, 3 times this week.",
    "He is working on a sextet!",
    "Can we work on the Bb major scale and the 2nd movement?",
    "Thanks! See you Thursday at 7.",
    "Page 45, exercises 1-10 please.",
    "The concert is on 10/24 at 7:30.",
    "She has All-District auditions in January.",
    "Let's focus on sixteenth notes at 88 bpm.",
  ];
  it.each(allowed)("allows %s", (text) => {
    expect(messageViolation(text)).toBeNull();
  });
});

describe("violationSpans", () => {
  it("points at exactly the blocked words", () => {
    const text = "Great lesson! Text me at 919-555-0142 or add me on snapchat @mayaplays";
    const spans = violationSpans(text).map((s) => [text.slice(s.start, s.end), s.reason]);
    expect(spans).toEqual([
      ["919-555-0142", "phone numbers"],
      ["snapchat", "outside apps, social media, or payment apps"],
      ["@mayaplays", "social media handles"],
    ]);
  });

  it("returns nothing for an allowed message", () => {
    expect(violationSpans("See you Thursday at 7 — bring the etude!")).toEqual([]);
  });

  it("merges overlapping matches", () => {
    // The email pattern and the link pattern both match part of this.
    const spans = violationSpans("write to kid@gmail.com");
    expect(spans).toHaveLength(1);
    expect("write to kid@gmail.com".slice(spans[0].start, spans[0].end)).toBe("kid@gmail.com");
  });

  it("agrees with messageViolation on every input", () => {
    const pieces = fc.constantFrom("hi", " ", "919-555-1234", "snapchat", "@leo_plays", "come over", "measures 12-24", "İ", "www.x.com", "Bb", "\n");
    fc.assert(
      fc.property(fc.array(pieces, { maxLength: 8 }).map((a) => a.join(" ")), (text) => {
        const spans = violationSpans(text);
        expect(spans.length > 0).toBe(messageViolation(text) !== null);
        for (let i = 0; i < spans.length; i++) {
          expect(spans[i].start).toBeGreaterThanOrEqual(0);
          expect(spans[i].end).toBeLessThanOrEqual(text.length);
          expect(spans[i].start).toBeLessThan(spans[i].end);
          if (i > 0) expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
        }
      }),
    );
  });
});
