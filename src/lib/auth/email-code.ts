import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "../supabase/admin";
import { emailProvider } from "../email/provider";
import { renderEmail } from "../email/templates";
import { toActionError, type ActionError } from "../errors";

/**
 * Sign-up and password-reset codes, delivered by the app's own email provider
 * (Nodemailer or Brevo) instead of Supabase Auth's mailer.
 *
 * Only an HMAC of each code is stored (keyed with the service-role key, which
 * never leaves the server), so a database leak doesn't reveal live codes.
 * Rate limits and the 5-attempt lockout live in the database functions.
 */
export type CodePurpose = "signup" | "reset";
export type CodeCheck = "ok" | "invalid" | "expired" | "locked" | "missing";

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;

export function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

export function hashCode(email: string, purpose: CodePurpose, code: string, key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""): string {
  return createHmac("sha256", `tfac-email-code:${key}`).update(`${purpose}:${email.trim().toLowerCase()}:${code}`).digest("hex");
}

/** Normalizes what a person typed ("123 456", "123-456") to digits, or null if it can't be a code. */
export function normalizeCode(input: unknown): string | null {
  const digits = String(input ?? "").replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(digits) ? digits : null;
}

export const CODE_MESSAGES: Record<Exclude<CodeCheck, "ok">, string> = {
  invalid: "That code isn’t right. Check the latest email and try again.",
  expired: "That code has expired. Request a new one below.",
  locked: "Too many wrong tries, so that code no longer works. Request a new one below.",
  missing: "That code isn’t valid anymore. Request a new one below.",
};

export const SETUP_ERROR: ActionError = {
  message: "Email sign-up isn’t available right now. Please try again later.",
  code: "EMAIL_NOT_CONFIGURED",
};

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export function serviceOrNull() {
  const supabase = createServiceClient();
  if (!supabase || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[auth] SUPABASE_SERVICE_ROLE_KEY is not set; email codes are unavailable.");
    return null;
  }
  return supabase;
}

/**
 * Issues a code and emails it. When `deliver` is false the code is issued
 * (so rate limits behave identically) but nothing is sent — used for password
 * resets on emails with no account, so responses don't reveal who has one.
 */
export async function sendEmailCode(opts: {
  email: string;
  purpose: CodePurpose;
  name?: string | null;
  deliver?: boolean;
}): Promise<{ ok: true } | { ok: false; error: ActionError }> {
  const supabase = serviceOrNull();
  const provider = emailProvider();
  const missing = provider.missingConfig();
  if (!supabase || missing.length) {
    if (missing.length) console.error(`[auth] email provider "${provider.name}" is missing: ${missing.join(", ")}`);
    return { ok: false, error: SETUP_ERROR };
  }

  const email = opts.email.trim().toLowerCase();
  const code = generateCode();
  const { data: sendId, error } = await supabase.rpc("issue_email_code", {
    p_email: email,
    p_purpose: opts.purpose,
    p_code_hash: hashCode(email, opts.purpose, code),
    p_ip: (await clientIp()) ?? undefined,
    p_ttl_minutes: CODE_TTL_MINUTES,
  });
  if (error) return { ok: false, error: toActionError(error, "We couldn’t send a code right now. Please try again.") };
  if (opts.deliver === false) return { ok: true };

  const rendered = renderEmail("verification_code", {
    code,
    purpose: opts.purpose,
    minutes: CODE_TTL_MINUTES,
    recipient_first: opts.name?.trim().split(/\s+/)[0] ?? "",
  });
  try {
    await provider.send({ to: email, toName: opts.name ?? null, email: rendered! });
    return { ok: true };
  } catch (e) {
    console.error(`[auth] could not send ${opts.purpose} code via ${provider.name}:`, e instanceof Error ? e.message : e);
    // Forgive this send so the person can retry straight away.
    await supabase.rpc("clear_email_code", { p_email: email, p_purpose: opts.purpose, p_send_id: sendId ?? undefined });
    return { ok: false, error: { message: "We couldn’t send the email. Please check the address and try again.", code: "SEND_FAILED" } };
  }
}

export async function checkEmailCode(email: string, purpose: CodePurpose, code: string): Promise<CodeCheck | "error"> {
  const supabase = serviceOrNull();
  if (!supabase) return "error";
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase.rpc("check_email_code", {
    p_email: normalized,
    p_purpose: purpose,
    p_code_hash: hashCode(normalized, purpose, code),
  });
  if (error) {
    console.error("[auth] check_email_code failed:", error.message);
    return "error";
  }
  return data as CodeCheck;
}

export async function clearEmailCode(email: string, purpose: CodePurpose) {
  const supabase = serviceOrNull();
  await supabase?.rpc("clear_email_code", { p_email: email.trim().toLowerCase(), p_purpose: purpose });
}

export async function findAuthUser(email: string): Promise<{ id: string; confirmed: boolean } | null | "error"> {
  const supabase = serviceOrNull();
  if (!supabase) return "error";
  const { data, error } = await supabase.rpc("auth_user_by_email", { p_email: email.trim().toLowerCase() });
  if (error) {
    console.error("[auth] auth_user_by_email failed:", error.message);
    return "error";
  }
  return data?.[0] ?? null;
}
