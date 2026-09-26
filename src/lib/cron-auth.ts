import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Scheduled jobs authenticate with a bearer secret. Two are accepted so they
 * can be rotated independently:
 *   CRON_SECRET          — sent automatically by Vercel Cron
 *   SUPABASE_CRON_SECRET — sent by Supabase pg_cron via pg_net (stored in Vault)
 */
export function cronAuthorized(authorization: string | null): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const given = Buffer.from(authorization.slice(7));
  return [process.env.CRON_SECRET, process.env.SUPABASE_CRON_SECRET].some((secret) => {
    if (!secret || secret.length < 8) return false;
    const want = Buffer.from(secret);
    return want.length === given.length && timingSafeEqual(want, given);
  });
}
