import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { OutgoingEmail, EmailProvider } from "./provider";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 = implicit TLS; 587/25 = STARTTLS (upgraded automatically).
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

/** Any SMTP server via Nodemailer (e.g. a Gmail app password). Selected with EMAIL_PROVIDER=smtp. */
export const smtpProvider: EmailProvider = {
  name: "smtp",
  missingConfig() {
    const missing = [];
    for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"]) if (!process.env[key]) missing.push(key);
    return missing;
  },
  async send({ to, toName, email }: OutgoingEmail) {
    const info = await getTransporter().sendMail({
      from: { name: process.env.EMAIL_FROM_NAME || "Teach for a Cause", address: process.env.EMAIL_FROM! },
      to: toName ? { name: toName, address: to } : to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: email.attachments?.map((a) => ({
        filename: a.name,
        content: Buffer.from(a.content, "base64"),
        contentType: a.name.endsWith(".ics") ? "text/calendar; charset=utf-8; method=PUBLISH" : undefined,
      })),
    });
    const rejected = (info.rejected ?? []).map(String);
    // Log the server's reply (never the address itself) so delivery can be traced in Vercel logs.
    console.info(`[email] smtp ${rejected.length ? "REJECTED" : "accepted"} → *@${to.split("@")[1]} id=${info.messageId} reply="${info.response}"`);
    if (rejected.length) throw new Error(`SMTP server rejected the recipient (${info.response})`);
  },
  // A dropped connection or timeout after the message was handed over may still deliver it.
  isAmbiguousFailure: (e) => {
    const code = (e as { code?: string } | null)?.code;
    return code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNRESET";
  },
};
