import { createHash } from "node:crypto";

/**
 * Checks a password against Have I Been Pwned's list of leaked passwords
 * using k-anonymity: only the first 5 hex characters of its SHA-1 hash are
 * sent, never the password. Accounts are created through the Supabase admin
 * API, which skips Supabase's own leaked-password check, so the app does it.
 *
 * Fails open (returns false) if the service is slow or down, so sign-up
 * never breaks because of it.
 */
export async function isLeakedPassword(password: string, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<boolean> {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "teach-for-a-cause" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 2500),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const LEAKED_PASSWORD_MESSAGE = "That password has shown up in a data breach, so it’s easy to guess. Please choose a different one.";
