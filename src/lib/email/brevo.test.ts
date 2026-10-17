import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrevoError, brevoProvider } from "./brevo";
import { fallbackProvider } from "./provider";
import { sendFailure } from "../auth/email-code";
import { renderEmail } from "./templates";

const code = renderEmail("verification_code", { code: "123456", purpose: "signup", minutes: 10, recipient_first: "Pat" })!;
const booked = renderEmail("session_booked", {
  role: "family", subject: "Clarinet", when: "Thu 5 PM", minutes: 45, student_name: "Leo", other_name: "Jordan L.",
  session_id: "00000000-0000-0000-0000-000000000001", start_iso: "2026-10-22T21:00:00Z", end_iso: "2026-10-22T21:45:00Z",
})!;

function reply(status: number, body: unknown = { messageId: "<abc@smtp-relay.brevo.com>" }) {
  return vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}

beforeEach(() => {
  Object.assign(process.env, { BREVO_API_KEY: "xkeysib-test", BREVO_SENDER_EMAIL: "lessons@example.org", BREVO_SENDER_NAME: "Teach for a Cause" });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.EMAIL_FALLBACK_PROVIDER;
});

describe("Brevo sender", () => {
  it("sends the code with the key, the verified sender, both bodies and an otp tag", async () => {
    const f = reply(201);
    vi.stubGlobal("fetch", f);
    await brevoProvider.send({ to: "parent@example.com", toName: "Pat", email: code, tag: "otp" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
    const body = JSON.parse(String(init.body));
    expect(body.sender).toEqual({ email: "lessons@example.org", name: "Teach for a Cause" });
    expect(body.to).toEqual([{ email: "parent@example.com", name: "Pat" }]);
    expect(body.htmlContent).toContain("123456");
    expect(body.textContent).toContain("123456");
    expect(body.tags).toEqual(["otp"]);
  });

  it("attaches calendar invites to lesson emails", async () => {
    const f = reply(201);
    vi.stubGlobal("fetch", f);
    await brevoProvider.send({ to: "parent@example.com", email: booked });
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.attachment[0].name).toBe("lesson.ics");
    expect(body.tags).toEqual(["transactional"]);
  });

  it.each([400, 401, 403, 429, 500, 503])("a %i is a definite failure with its status (the outbox may retry it)", async (status) => {
    vi.stubGlobal("fetch", reply(status, { code: "x", message: "nope" }));
    const err = await brevoProvider.send({ to: "parent@example.com", email: code }).catch((e) => e);
    expect(err).toBeInstanceOf(BrevoError);
    expect(err.status).toBe(status);
    expect(brevoProvider.isAmbiguousFailure(err)).toBe(false);
  });

  it("a timeout may have been delivered, so it is never resent automatically", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }));
    const err = await brevoProvider.send({ to: "parent@example.com", email: code }).catch((e) => e);
    expect(brevoProvider.isAmbiguousFailure(err)).toBe(true);
  });

  it("reports exactly which Brevo settings are missing", () => {
    delete process.env.BREVO_API_KEY;
    expect(brevoProvider.missingConfig()).toEqual(["BREVO_API_KEY"]);
  });
});

describe("what a parent sees when a code can't be sent", () => {
  it("never blames the parent for our setup", () => {
    expect(sendFailure(new BrevoError("bad key", 401), { name: "brevo" }).code).toBe("EMAIL_NOT_CONFIGURED");
    expect(sendFailure(new BrevoError("bad sender", 403), { name: "brevo" }).code).toBe("EMAIL_NOT_CONFIGURED");
  });
  it("says busy, bad address, or try again", () => {
    expect(sendFailure(new BrevoError("slow down", 429), { name: "brevo" }).message).toContain("try again in a minute");
    expect(sendFailure(new BrevoError("invalid email", 400), { name: "brevo" }).message).toContain("check it");
    expect(sendFailure(new Error("socket hang up"), { name: "smtp" }).code).toBe("SEND_FAILED");
  });
});

describe("backup sender for codes", () => {
  it("is off unless set, ready and different from the main sender", () => {
    process.env.EMAIL_PROVIDER = "brevo";
    expect(fallbackProvider()).toBeNull();
    process.env.EMAIL_FALLBACK_PROVIDER = "brevo";
    expect(fallbackProvider()).toBeNull();
    Object.assign(process.env, { EMAIL_FALLBACK_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_FROM: "a@example.com" });
    expect(fallbackProvider()?.name).toBe("smtp");
    delete process.env.SMTP_PASS;
    expect(fallbackProvider()).toBeNull();
  });
});
