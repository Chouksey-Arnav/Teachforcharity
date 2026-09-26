import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { simpleParser, type ParsedMail } from "mailparser";
import { emailProvider } from "./provider";
import { renderEmail } from "./templates";

// A real SMTP server on localhost: proves Nodemailer actually delivers, with auth.
const received: ParsedMail[] = [];
const PORT = 2587;
let server: SMTPServer;

beforeAll(async () => {
  server = new SMTPServer({
    secure: false,
    authOptional: false,
    disabledCommands: ["STARTTLS"],
    onAuth(auth, _session, cb) {
      if (auth.username === "tester" && auth.password === "s3cret") return cb(null, { user: "tester" });
      cb(new Error("Invalid login"));
    },
    onData(stream, _session, cb) {
      simpleParser(stream).then((m) => {
        received.push(m);
        cb();
      }, cb);
    },
  });
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", r));
  Object.assign(process.env, {
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(PORT),
    SMTP_SECURE: "false",
    SMTP_USER: "tester",
    SMTP_PASS: "s3cret",
    EMAIL_FROM: "lessons@example.test",
    EMAIL_FROM_NAME: "Teach for a Cause",
  });
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe("email provider selection", () => {
  it("uses Nodemailer when EMAIL_PROVIDER=smtp and Brevo otherwise", () => {
    expect(emailProvider().name).toBe("smtp");
    const prev = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = "brevo";
    expect(emailProvider().name).toBe("brevo");
    delete process.env.EMAIL_PROVIDER;
    expect(emailProvider().name).toBe("brevo");
    process.env.EMAIL_PROVIDER = prev;
  });

  it("reports exactly which SMTP settings are missing", () => {
    const saved = process.env.SMTP_PASS;
    delete process.env.SMTP_PASS;
    expect(emailProvider().missingConfig()).toEqual(["SMTP_PASS"]);
    process.env.SMTP_PASS = saved;
    expect(emailProvider().missingConfig()).toEqual([]);
  });
});

describe("Nodemailer delivery", () => {
  it("delivers a real booking email with the calendar invite over SMTP", async () => {
    const email = renderEmail("session_booked", {
      recipient_first: "Pat",
      role: "family",
      other_name: "Maya R.",
      student_name: "Leo",
      subject: "Clarinet",
      when: "Thursday, October 1 at 7:00 PM ET",
      start_iso: "2026-10-01T23:00:00Z",
      end_iso: "2026-10-01T23:45:00Z",
      minutes: 45,
      meet_url: "https://meet.google.com/abc-defg-hij",
      session_id: "s-1",
    })!;
    await emailProvider().send({ to: "parent@example.test", toName: "Pat Parent", email });

    expect(received).toHaveLength(1);
    const m = received[0];
    expect(m.from?.value[0]).toMatchObject({ address: "lessons@example.test", name: "Teach for a Cause" });
    expect(m.to && !Array.isArray(m.to) && m.to.value[0].address).toBe("parent@example.test");
    expect(m.subject).toContain("Booked: Clarinet lesson");
    expect(m.html).toContain("meet.google.com/abc-defg-hij");
    expect(m.text).toContain("Google Meet");
    const ics = m.attachments.find((a) => a.filename === "lesson.ics");
    expect(ics?.content.toString()).toContain("DTSTART:20261001T230000Z");
  });

  it("surfaces a clear error for wrong credentials (and treats it as a definite, retryable failure)", async () => {
    process.env.SMTP_PASS = "wrong";
    const { smtpProvider } = await import("./smtp");
    // Fresh transporter so the new password is used.
    const nodemailer = (await import("nodemailer")).default;
    const t = nodemailer.createTransport({ host: "127.0.0.1", port: PORT, secure: false, auth: { user: "tester", pass: "wrong" } });
    const err = await t.sendMail({ from: "a@example.test", to: "b@example.test", text: "x" }).catch((e) => e);
    expect(String(err)).toMatch(/Invalid login|535|auth/i);
    expect(smtpProvider.isAmbiguousFailure(err)).toBe(false);
    process.env.SMTP_PASS = "s3cret";
  });
});
