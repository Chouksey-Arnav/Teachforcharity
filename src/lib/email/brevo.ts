import "server-only";
import type { OutgoingEmail, EmailProvider } from "./provider";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/** Brevo transactional API. Selected with EMAIL_PROVIDER=brevo. */
export const brevoProvider: EmailProvider = {
  name: "brevo",
  missingConfig() {
    const missing = [];
    if (!process.env.BREVO_API_KEY) missing.push("BREVO_API_KEY");
    if (!process.env.BREVO_SENDER_EMAIL) missing.push("BREVO_SENDER_EMAIL");
    return missing;
  },
  async send({ to, toName, email }: OutgoingEmail) {
    const body = {
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "Teach for a Cause" },
      to: [{ email: to, ...(toName ? { name: toName } : {}) }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
      ...(email.attachments?.length ? { attachment: email.attachments } : {}),
      tags: ["transactional"],
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(BREVO_ENDPOINT, {
        method: "POST",
        headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Brevo ${res.status}: ${detail.slice(0, 300)}`);
      }
    } finally {
      clearTimeout(timer);
    }
  },
  // A timeout means Brevo may already have accepted the message.
  isAmbiguousFailure: (e) => e instanceof Error && e.name === "AbortError",
};
