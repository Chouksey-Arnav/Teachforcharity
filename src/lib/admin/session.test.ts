import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

const load = async () => {
  vi.resetModules();
  return import("./session");
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin password", () => {
  it("falls back to the documented default when ADMIN_PASSWORD is unset, and says so", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    const s = await load();
    expect(s.usingFallbackPassword()).toBe(true);
    expect(s.passwordMatches("123987")).toBe(true);
    expect(s.passwordMatches("wrong")).toBe(false);
  });

  it("uses ADMIN_PASSWORD when set, and the fallback stops working", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "correct horse battery staple");
    const s = await load();
    expect(s.usingFallbackPassword()).toBe(false);
    expect(s.passwordMatches("correct horse battery staple")).toBe(true);
    expect(s.passwordMatches("123987")).toBe(false);
  });
});

describe("admin session token", () => {
  it("accepts a fresh token and rejects tampering", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw-one");
    const s = await load();
    const { value } = s.makeSessionToken();
    expect(s.verifySessionToken(value)).toBe(true);
    const [exp, mac] = value.split(".");
    expect(s.verifySessionToken(`${Number(exp) + 999999}.${mac}`)).toBe(false);
    expect(s.verifySessionToken(`${exp}.${"0".repeat(64)}`)).toBe(false);
    expect(s.verifySessionToken("garbage")).toBe(false);
    expect(s.verifySessionToken(undefined)).toBe(false);
  });

  it("expires after 12 hours", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw-one");
    const s = await load();
    const t0 = Date.now();
    const { value } = s.makeSessionToken(t0);
    expect(s.verifySessionToken(value, t0 + 11 * 3600_000)).toBe(true);
    expect(s.verifySessionToken(value, t0 + 13 * 3600_000)).toBe(false);
  });

  it("changing ADMIN_PASSWORD signs everyone out", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw-one");
    const a = await load();
    const { value } = a.makeSessionToken();
    vi.stubEnv("ADMIN_PASSWORD", "pw-two");
    const b = await load();
    expect(b.verifySessionToken(value)).toBe(false);
  });
});
