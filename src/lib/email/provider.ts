import "server-only";
import type { RenderedEmail } from "./templates";
import { brevoProvider } from "./brevo";
import { smtpProvider } from "./smtp";

export interface OutgoingEmail {
  to: string;
  toName?: string | null;
  email: RenderedEmail;
}

export interface EmailProvider {
  name: "brevo" | "smtp";
  /** Env vars this provider still needs (empty = ready). */
  missingConfig(): string[];
  send(msg: OutgoingEmail): Promise<void>;
  /** True when a failure may still have been delivered, so it must not be retried automatically. */
  isAmbiguousFailure(e: unknown): boolean;
}

/**
 * EMAIL_PROVIDER picks the sender: "smtp" (Nodemailer) or "brevo".
 * Unset defaults to "brevo" so existing production setups keep working.
 */
export function emailProvider(): EmailProvider {
  return (process.env.EMAIL_PROVIDER ?? "brevo").trim().toLowerCase() === "smtp" ? smtpProvider : brevoProvider;
}
