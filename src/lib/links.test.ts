import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signLessonToken, verifyLessonToken } from "./links";

const id = "0b0c9f5e-1d2a-4b8e-9c3a-6f5e4d3c2b1a";

beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key"));
afterEach(() => vi.unstubAllEnvs());

describe("lesson links", () => {
  it("round-trips a signed token", () => {
    const t = signLessonToken(id)!;
    expect(verifyLessonToken(t)).toEqual({ ok: true, sessionId: id });
  });

  it("rejects tampering with the lesson, the expiry or the signature", () => {
    const t = signLessonToken(id)!;
    const [, exp, sig] = t.split(".");
    const other = "1b0c9f5e-1d2a-4b8e-9c3a-6f5e4d3c2b1a";
    expect(verifyLessonToken(`${other}.${exp}.${sig}`).ok).toBe(false);
    expect(verifyLessonToken(`${id}.${Number(exp) + 999999}.${sig}`).ok).toBe(false);
    expect(verifyLessonToken(`${id}.${exp}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`).ok).toBe(false);
    expect(verifyLessonToken("garbage").ok).toBe(false);
  });

  it("expires after 30 days", () => {
    const now = Date.UTC(2026, 9, 1);
    const t = signLessonToken(id, now)!;
    expect(verifyLessonToken(t, now + 29 * 86400000).ok).toBe(true);
    expect(verifyLessonToken(t, now + 31 * 86400000)).toEqual({ ok: false, reason: "expired" });
  });

  it("stops working when the server key changes, and signs nothing without one", () => {
    const t = signLessonToken(id)!;
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "rotated");
    expect(verifyLessonToken(t).ok).toBe(false);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(signLessonToken(id)).toBeNull();
    expect(verifyLessonToken(t).ok).toBe(false);
  });
});
