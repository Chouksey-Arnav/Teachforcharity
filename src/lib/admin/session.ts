import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { createServiceClient } from "../supabase/admin";
import { adminSessionState, type AdminSessionState } from "./mfa";

/**
 * Admin console sign-in.
 *
 * Admins are ordinary accounts whose profile role is "admin". The console
 * only opens for a session that has also passed a two-factor (TOTP) check
 * within the last 12 hours. The database enforces the same rule on its own:
 * private.is_admin() is false unless the session's JWT says aal2, so a
 * stolen password alone can't read anything.
 *
 * Every console query runs as the signed-in admin (not the service role), so
 * the activity log records which person did what.
 */
export interface AdminSession {
  state: AdminSessionState;
  userId: string | null;
  email: string | null;
  name: string | null;
}

export const getAdminSession = cache(async (): Promise<AdminSession> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { state: "signed_out", userId: null, email: null, name: null };
  const { data: profile } = await supabase.from("profiles").select("role, full_name, email").eq("id", claims.sub).maybeSingle();
  return {
    state: adminSessionState({ role: profile?.role ?? "none", aal: claims.aal, amr: claims.amr, now: Date.now() }),
    userId: claims.sub,
    email: profile?.email ?? (typeof claims.email === "string" ? claims.email : null),
    name: profile?.full_name ?? null,
  };
});

export async function isAdmin(): Promise<boolean> {
  return (await getAdminSession()).state === "ok";
}

/** For admin pages and actions: sends anyone without a fully signed-in admin session to the sign-in page. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (session.state !== "ok") redirect("/admin/login");
  return session;
}

export class AdminSetupError extends Error {}

/** The signed-in admin's own database client (RLS and private.is_admin() apply). */
export async function adminDb() {
  await requireAdmin();
  return createClient();
}

/**
 * The service-role client, for the few console jobs the database can't do as
 * a user (draining the email queue, resetting another admin's two-factor).
 */
export async function adminServiceDb() {
  const session = await requireAdmin();
  const db = createServiceClient();
  if (!db) throw new AdminSetupError("SUPABASE_SERVICE_ROLE_KEY is not set in this deployment.");
  return { db, session };
}
