/** Pure rules for admin sessions, kept separate so they can be unit-tested. */

/** How long a two-factor check lasts before the console asks for a new code. */
export const ADMIN_MFA_MAX_AGE_SECONDS = 12 * 60 * 60;

export type AdminSessionState =
  /** No one is signed in. */
  | "signed_out"
  /** Signed in, but the account isn't an admin. */
  | "not_admin"
  /** An admin who hasn't passed a two-factor check in this session. */
  | "needs_mfa"
  /** An admin whose two-factor check is older than ADMIN_MFA_MAX_AGE_SECONDS. */
  | "stale_mfa"
  | "ok";

interface AmrEntry {
  method?: unknown;
  timestamp?: unknown;
}

/** Unix seconds of the most recent TOTP check recorded in the JWT's `amr` claim, or null. */
export function lastTotpAt(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr as AmrEntry[]) {
    if (entry && entry.method === "totp" && typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp)) {
      latest = latest === null ? entry.timestamp : Math.max(latest, entry.timestamp);
    }
  }
  return latest;
}

export function adminSessionState(input: { role: string | null; aal: unknown; amr: unknown; now: number }): AdminSessionState {
  if (input.role === null) return "signed_out";
  if (input.role !== "admin") return "not_admin";
  if (input.aal !== "aal2") return "needs_mfa";
  const at = lastTotpAt(input.amr);
  if (at === null) return "needs_mfa";
  const age = Math.floor(input.now / 1000) - at;
  return age > ADMIN_MFA_MAX_AGE_SECONDS ? "stale_mfa" : "ok";
}
