import { describe, expect, it } from "vitest";
import { normalizeMeetUrl } from "./meet";

describe("normalizeMeetUrl", () => {
  it.each([
    ["https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij"],
    ["meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij"],
    ["  HTTPS://MEET.GOOGLE.COM/ABC-DEFG-HIJ?authuser=0  ", "https://meet.google.com/abc-defg-hij"],
    ["abc-defg-hij", "https://meet.google.com/abc-defg-hij"],
    ["http://meet.google.com/abc-defg-hij/", "https://meet.google.com/abc-defg-hij"],
  ])("accepts %s", (input, out) => expect(normalizeMeetUrl(input)).toBe(out));

  it.each(["", "https://zoom.us/j/123", "https://meet.google.com/", "https://meet.google.com.evil.test/abc-defg-hij",
    "https://evil.test/meet.google.com/abc-defg-hij", "abc-defg", "javascript:alert(1)"])("rejects %s", (input) =>
    expect(normalizeMeetUrl(input)).toBeNull(),
  );
});
