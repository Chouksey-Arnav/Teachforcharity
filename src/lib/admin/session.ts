import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceClient } from "../supabase/admin";

/**
 * Admin console sign-in.
 *
 * The password comes from the ADMIN_PASSWORD environment variable (set it in
 * Vercel → Settings → Environment Variables, then redeploy). If it's missing,
 * the fallback below is used and the console shows a red warning on every page:
 * this repository is public, so the fallback is effectively public too.
 *
 * A successful sign-in sets an HttpOnly, SameSite=Strict cookie holding an
 * expiry and an HMAC over it. The HMAC key is derived from the password and
 * the service-role key, so changing ADMIN_PASSWORD signs everyone out.
 * Failed attempts are rate limited in the database (10 per IP / 50 total per
 * 15 minutes) and every attempt is written to the audit log.
 */
export const FALLBACK_ADMIN_PASSWORD = "123987";
const COOKIE = "tfac_admin";
const TTL_SECONDS = 12 * 60 * 60;

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || FALLBACK_ADMIN_PASSWORD;
}

export function usingFallbackPassword(): boolean {
  return !process.env.ADMIN_PASSWORD?.trim();
}

function key(): Buffer {
  return createHash("sha256")
    .update(`tfac-admin:${adminPassword()}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`)
    .digest();
}

function sign(exp: number): string {
  return createHmac("sha256", key()).update(String(exp)).digest("hex");
}

/** Constant-time password check (both sides hashed to a fixed length first). */
export function passwordMatches(input: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(adminPassword()).digest();
  return timingSafeEqual(a, b);
}

export function makeSessionToken(now = Date.now()): { value: string; maxAge: number } {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  return { value: `${exp}.${sign(exp)}`, maxAge: TTL_SECONDS };
}

export function verifySessionToken(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [expStr, mac] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < now || !/^[0-9a-f]{64}$/.test(mac ?? "")) return false;
  const want = Buffer.from(sign(exp), "hex");
  const got = Buffer.from(mac, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(COOKIE)?.value);
}

export async function setAdminCookie() {
  const jar = await cookies();
  const { value, maxAge } = makeSessionToken();
  jar.set(COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** For admin pages: redirects to the sign-in page unless signed in. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

export class AdminSetupError extends Error {}

/**
 * The service-role database client, only after the admin cookie checks out.
 * Every admin function in the database also re-checks that the caller is
 * the service role (or an admin user).
 */
export async function adminDb() {
  await requireAdmin();
  const db = createServiceClient();
  if (!db) throw new AdminSetupError("SUPABASE_SERVICE_ROLE_KEY is not set in this deployment.");
  return db;
}
