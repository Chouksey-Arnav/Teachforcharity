import { describe, expect, it } from "vitest";
import { buildIcs, icsText } from "./ics";

describe("ics", () => {
  it("escapes TEXT values per RFC 5545", () => {
    expect(icsText("a;b,c\\d\ne")).toBe("a\;b\\,c\\\\d\\ne");
  });

  it("writes one VEVENT per lesson and CRLF line endings", () => {
    const out = buildIcs({
      events: [
        { uid: "a", start: "2026-10-01T21:00:00Z", end: "2026-10-01T21:45:00Z" },
        { uid: "b", start: "2026-10-08T21:00:00Z", end: "2026-10-08T21:45:00Z" },
      ],
      summary: "Clarinet lesson; with Leo",
      description: "Join from the Lessons page",
      location: "https://example.test/dashboard/lessons",
    });
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(out).toContain("DTSTART:20261008T210000Z");
    expect(out).toContain("SUMMARY:Clarinet lesson\; with Leo");
    expect(out.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});
