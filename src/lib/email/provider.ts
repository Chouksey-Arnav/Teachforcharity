import "server-only";
import type { RenderedEmail } from "./templates";
import { brevoProvider } from "./brevo";
import { smtpProvider } from "./smtp";

export interface OutgoingEmail {
  to: string;
  toName?: string | null;
  email: RenderedEmail;
  /** A label for the provider's logs ("otp" for sign-in codes). */
  tag?: string;
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

/**
 * A second sender for sign-up and reset codes only (EMAIL_FALLBACK_PROVIDER,
 * "smtp" or "brevo", different from EMAIL_PROVIDER), used when the main one
 * fails. Resending the same code is harmless, unlike resending a lesson email,
 * so codes may go twice rather than not at all. Null when unset or not ready.
 */
export function fallbackProvider(): EmailProvider | null {
  const name = (process.env.EMAIL_FALLBACK_PROVIDER ?? "").trim().toLowerCase();
  if (!name) return null;
  const p = name === "smtp" ? smtpProvider : name === "brevo" ? brevoProvider : null;
  if (!p || p.name === emailProvider().name || p.missingConfig().length) return null;
  return p;
}

