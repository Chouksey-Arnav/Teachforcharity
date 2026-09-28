import { describe, expect, it } from "vitest";
import { ADMIN_MFA_MAX_AGE_SECONDS, adminSessionState, lastTotpAt } from "./mfa";

const now = Date.UTC(2026, 8, 28, 12, 0, 0);
const sec = Math.floor(now / 1000);

describe("lastTotpAt", () => {
  it("returns the most recent TOTP timestamp and ignores other methods", () => {
    expect(lastTotpAt([{ method: "password", timestamp: sec }, { method: "totp", timestamp: sec - 50 }, { method: "totp", timestamp: sec - 10 }])).toBe(sec - 10);
  });
  it("is null when there is no TOTP entry or the claim is malformed", () => {
    expect(lastTotpAt([{ method: "password", timestamp: sec }])).toBeNull();
    expect(lastTotpAt(undefined)).toBeNull();
    expect(lastTotpAt("totp")).toBeNull();
    expect(lastTotpAt([null, { method: "totp", timestamp: "123" }, { method: "totp", timestamp: Number.NaN }])).toBeNull();
  });
});

describe("adminSessionState", () => {
  const fresh = [{ method: "password", timestamp: sec - 60 }, { method: "totp", timestamp: sec - 30 }];
  it("opens the console only for an admin with a fresh two-factor session", () => {
    expect(adminSessionState({ role: "admin", aal: "aal2", amr: fresh, now })).toBe("ok");
  });
  it("refuses non-admins even with two-factor", () => {
    expect(adminSessionState({ role: "family", aal: "aal2", amr: fresh, now })).toBe("not_admin");
    expect(adminSessionState({ role: "reviewer", aal: "aal2", amr: fresh, now })).toBe("not_admin");
    expect(adminSessionState({ role: "none", aal: "aal2", amr: fresh, now })).toBe("not_admin");
  });
  it("asks an admin with only a password for a code", () => {
    expect(adminSessionState({ role: "admin", aal: "aal1", amr: [{ method: "password", timestamp: sec }], now })).toBe("needs_mfa");
    expect(adminSessionState({ role: "admin", aal: "aal2", amr: [{ method: "password", timestamp: sec }], now })).toBe("needs_mfa");
  });
  it("asks again once the code is older than the limit", () => {
    const old = [{ method: "totp", timestamp: sec - ADMIN_MFA_MAX_AGE_SECONDS - 1 }];
    const edge = [{ method: "totp", timestamp: sec - ADMIN_MFA_MAX_AGE_SECONDS }];
    expect(adminSessionState({ role: "admin", aal: "aal2", amr: old, now })).toBe("stale_mfa");
    expect(adminSessionState({ role: "admin", aal: "aal2", amr: edge, now })).toBe("ok");
  });
  it("treats no profile as signed out", () => {
    expect(adminSessionState({ role: null, aal: "aal2", amr: fresh, now })).toBe("signed_out");
  });
});
