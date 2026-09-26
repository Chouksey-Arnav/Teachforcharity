import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CODE_LENGTH, generateCode, hashCode, normalizeCode } from "./email-code";
import { renderEmail } from "../email/templates";

describe("generateCode", () => {
  it("is always exactly 6 digits, including leading zeros", () => {
    for (let i = 0; i < 5000; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("is spread across the whole range (not stuck or biased to a prefix)", () => {
    const firstDigits = new Set(Array.from({ length: 2000 }, () => generateCode()[0]));
    expect(firstDigits.size).toBe(10);
    const unique = new Set(Array.from({ length: 2000 }, () => generateCode()));
    expect(unique.size).toBeGreaterThan(1990); // birthday bound for 2000 draws from 1e6 is ~2 collisions
  });
});

describe("hashCode", () => {
  it("never contains the code and is a 64-char hex HMAC", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999999 }), (n) => {
        const code = String(n).padStart(6, "0");
        const h = hashCode("a@b.co", "signup", code, "k");
        expect(h).toMatch(/^[0-9a-f]{64}$/);
        expect(h.includes(code)).toBe(false);
      }),
      { numRuns: 3000 },
    );
  });

  it("ignores email case/whitespace but binds purpose, email, code and key", () => {
    const base = hashCode("Ann@Example.com ", "signup", "123456", "k");
    expect(hashCode("ann@example.com", "signup", "123456", "k")).toBe(base);
    expect(hashCode("ann@example.com", "reset", "123456", "k")).not.toBe(base);
    expect(hashCode("bob@example.com", "signup", "123456", "k")).not.toBe(base);
    expect(hashCode("ann@example.com", "signup", "123457", "k")).not.toBe(base);
    expect(hashCode("ann@example.com", "signup", "123456", "other-key")).not.toBe(base);
  });
});

describe("normalizeCode", () => {
  it("accepts 6 digits with common separators", () => {
    expect(normalizeCode("012345")).toBe("012345");
    expect(normalizeCode(" 012 345 ")).toBe("012345");
    expect(normalizeCode("012-345")).toBe("012345");
    expect(normalizeCode(123456)).toBe("123456");
  });

  it("rejects anything that isn't exactly 6 digits", () => {
    for (const bad of ["", "12345", "1234567", "12a456", "١٢٣٤٥٦", null, undefined, "123456\n7"]) {
      expect(normalizeCode(bad)).toBeNull();
    }
    expect(CODE_LENGTH).toBe(6);
  });
});

describe("verification_code email", () => {
  it("shows the code in html and text, with the auth footer instead of the account footer", () => {
    const e = renderEmail("verification_code", { code: "004821", purpose: "signup", minutes: 10, recipient_first: "Ann" })!;
    expect(e.subject).toBe("004821 is your Teach for a Cause code");
    expect(e.html).toContain(">004821</span>");
    expect(e.text).toContain("004821");
    expect(e.text).toContain("Hi Ann,");
    expect(e.html).toContain("If that wasn’t you, ignore this email");
    expect(e.html).not.toContain("/dashboard/profile");
  });

  it("uses reset wording for password resets and never renders non-digits from the payload", () => {
    const e = renderEmail("verification_code", { code: "<b>12</b>3456", purpose: "reset" })!;
    expect(e.subject).toMatch(/^123456 /);
    expect(e.html).toContain("Reset your password");
    expect(e.html).not.toContain("<b>12");
    expect(e.html).toContain("your password stays the same");
  });
});
