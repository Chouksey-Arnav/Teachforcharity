import "server-only";
import type { OutgoingEmail, EmailProvider } from "./provider";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/** Brevo said no. `status` tells a bad key (401/403) from a bad address (400) or a busy moment (429/5xx). */
export class BrevoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BrevoError";
  }
}

/** Brevo transactional API. Selected with EMAIL_PROVIDER=brevo. */
export const brevoProvider: EmailProvider = {
  name: "brevo",
  missingConfig() {
    const missing = [];
    if (!process.env.BREVO_API_KEY) missing.push("BREVO_API_KEY");
    if (!process.env.BREVO_SENDER_EMAIL) missing.push("BREVO_SENDER_EMAIL");
    return missing;
  },
  async send({ to, toName, email, tag }: OutgoingEmail) {
    const body = {
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "Teach for a Cause" },
      to: [{ email: to, ...(toName ? { name: toName } : {}) }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
      ...(email.attachments?.length ? { attachment: email.attachments } : {}),
      tags: [tag || "transactional"],
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
        throw new BrevoError(`Brevo ${res.status}: ${detail.slice(0, 300)}`, res.status);
      }
      // Log Brevo's id (never the address) so a delivery can be traced in Brevo's logs.
      const json = (await res.json().catch(() => null)) as { messageId?: string } | null;
      console.info(`[email] brevo accepted → *@${to.split("@")[1]} id=${json?.messageId ?? "?"} tag=${tag || "transactional"}`);
    } finally {
      clearTimeout(timer);
    }
  },
  // A timeout means Brevo may already have accepted the message.
  isAmbiguousFailure: (e) => e instanceof Error && e.name === "AbortError",
};
