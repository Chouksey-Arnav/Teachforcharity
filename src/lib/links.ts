import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed links for one-tap actions in emails ("Yes, the lesson happened").
 * Stateless: the token is `<session id>.<expiry>.<HMAC>`, keyed with a
 * server-only secret, so nothing is stored and resending a reminder never
 * invalidates an earlier email. Anyone holding the link can only answer
 * that one lesson's confirmation, and only until it expires.
 */
const LESSON_LINK_DAYS = 30;

function key(): string | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return k ? `tfac-lesson-link:${k}` : null;
}

function mac(k: string, sessionId: string, exp: number): string {
  return createHmac("sha256", k).update(`confirm:${sessionId}:${exp}`).digest("base64url");
}

/** A token for confirming `sessionId`, or null when the server key isn't configured (emails then link to the dashboard). */
export function signLessonToken(sessionId: string, now = Date.now()): string | null {
  const k = key();
  if (!k || !/^[0-9a-f-]{36}$/.test(sessionId)) return null;
  const exp = Math.floor(now / 1000) + LESSON_LINK_DAYS * 86400;
  return `${sessionId}.${exp}.${mac(k, sessionId, exp)}`;
}

export type LessonTokenCheck = { ok: true; sessionId: string } | { ok: false; reason: "invalid" | "expired" };

export function verifyLessonToken(token: string, now = Date.now()): LessonTokenCheck {
  const k = key();
  const m = /^([0-9a-f-]{36})\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
  if (!k || !m) return { ok: false, reason: "invalid" };
  const [, sessionId, expStr, given] = m;
  const want = Buffer.from(mac(k, sessionId, Number(expStr)));
  const got = Buffer.from(given);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "invalid" };
  if (Number(expStr) * 1000 < now) return { ok: false, reason: "expired" };
  return { ok: true, sessionId };
}
