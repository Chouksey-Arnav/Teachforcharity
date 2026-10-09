"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickEmails } from "@/lib/email/kick";
import { drainOutbox } from "@/lib/email/worker";
import { emailProvider } from "@/lib/email/provider";
import { SITE } from "@/lib/site";
import { adminDb, adminServiceDb } from "@/lib/admin/session";
import { createClient } from "@/lib/supabase/server";
import { logAppEvent } from "@/lib/audit";
import { recordSignInDevice } from "@/lib/auth/sign-in-device";
import { safeNext } from "@/lib/redirect";
import { runSafetyScan } from "@/lib/safety/scanner";
import { runAccountChecks } from "@/lib/verification/runner";

/**
 * Admin console actions. Every one goes through adminDb(), which requires a
 * signed-in admin with a fresh two-factor check and returns that admin's own
 * database client — and every admin database function re-checks the caller
 * (private.is_admin()) on its own.
 */
const uuid = z.string().uuid();

function ok(message?: string): ActionState {
  kickEmails();
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// Sign in / out (password, then a code from an authenticator app)
// ---------------------------------------------------------------------------
const DENIED = "That email and password don’t match an admin account.";

/** Step 1: email + password. Only admin accounts stay signed in; the page then asks for a code. */
export async function adminSignIn(_: ActionState<{ email: string }>, form: FormData): Promise<ActionState<{ email: string }>> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { ok: false, error: { message: "Enter your email and password." }, data: { email } };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await logAppEvent(null, "admin.login_failed", "admin", null, { email });
    return { ok: false, error: { message: /rate limit/i.test(error?.message ?? "") ? "Too many attempts. Please wait a few minutes." : DENIED }, data: { email } };
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    await logAppEvent(data.user.id, "admin.login_denied", "admin", data.user.id, { email });
    return { ok: false, error: { message: DENIED }, data: { email } };
  }
  await logAppEvent(data.user.id, "admin.password_ok", "admin", data.user.id);
  await recordSignInDevice(data.user.id);
  redirect(`/admin/login${nextQuery(form.get("next"))}`);
}

async function signedInAdminId(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
  return profile?.role === "admin" ? { supabase, id } : null;
}

/** Step 2a (first sign-in only): create an authenticator-app factor and return its QR code. */
export async function adminStartEnroll(): Promise<ActionState<{ factorId: string; qr: string; secret: string }>> {
  const me = await signedInAdminId();
  if (!me) return { ok: false, error: { message: "Your session ended. Sign in again." } };
  const { data: factors, error: listErr } = await me.supabase.auth.mfa.listFactors();
  if (listErr) return { ok: false, error: { message: "Two-factor setup isn’t available right now. Try again shortly." } };
  if (factors.totp.length) return { ok: false, error: { message: "Two-factor is already set up for this account. Enter a code from your app." } };
  // Clear half-finished setups (e.g. a closed tab) so they don't pile up.
  for (const f of factors.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
    await me.supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await me.supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Admin console", issuer: SITE.name });
  if (error || !data) {
    console.error("[admin] mfa enroll failed:", error?.message);
    return { ok: false, error: { message: "Two-factor setup isn’t available right now. Check that TOTP is enabled in Supabase → Authentication → Multi-Factor." } };
  }
  return { ok: true, data: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } };
}

/** Step 2b: check a 6-digit code. Upgrades the session to two-factor, then opens the console. */
export async function adminVerifyCode(_: ActionState, form: FormData): Promise<ActionState> {
  const code = String(form.get("code") ?? "").replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, error: { message: "Enter the 6-digit code from your authenticator app." } };
  const me = await signedInAdminId();
  if (!me) return { ok: false, error: { message: "Your session ended. Sign in again." } };
  let factorId = String(form.get("factorId") ?? "");
  if (!factorId) {
    const { data: factors } = await me.supabase.auth.mfa.listFactors();
    factorId = factors?.totp[0]?.id ?? "";
  }
  if (!factorId) return { ok: false, error: { message: "Two-factor isn’t set up yet. Reload the page to set it up." } };
  const { error } = await me.supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    await logAppEvent(me.id, "admin.mfa_failed", "admin", me.id);
    return {
      ok: false,
      error: { message: /rate|too many/i.test(error.message) ? "Too many tries. Wait a minute, then use a new code." : "That code didn’t work. Check your app’s clock and use the newest code." },
    };
  }
  await logAppEvent(me.id, "admin.login", "admin", me.id);
  redirect(adminNext(form.get("next")) ?? "/admin");
}

export async function adminLogout() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) await logAppEvent(data.claims.sub, "admin.logout", "admin", data.claims.sub);
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/** Removes another admin's authenticator (e.g. a lost phone) and signs them out everywhere. */
export async function resetAdminTwoFactor(userId: string): Promise<ActionState> {
  if (!uuid.safeParse(userId).success) return { ok: false, error: { message: "Invalid request." } };
  const { db, session } = await adminServiceDb();
  if (userId === session.userId) return { ok: false, error: { message: "Ask another admin to reset your two-factor." } };
  const { data: target } = await db.from("profiles").select("role, email").eq("id", userId).maybeSingle();
  if (target?.role !== "admin") return { ok: false, error: { message: "That account isn’t an admin." } };
  const { data: factors, error } = await db.auth.admin.mfa.listFactors({ userId });
  if (error) return { ok: false, error: { message: error.message } };
  for (const f of factors.factors) {
    const { error: delErr } = await db.auth.admin.mfa.deleteFactor({ userId, id: f.id });
    if (delErr) return { ok: false, error: { message: delErr.message } };
  }
  await db.rpc("revoke_user_sessions", { p_user: userId });
  await logAppEvent(session.userId, "admin.mfa_reset", "profile", userId, { email: target.email });
  return ok(`Two-factor reset for ${target.email}. They’ll set it up again at their next sign-in.`);
}

/** A same-site path inside the admin console, or null. */
function adminNext(next: unknown): string | null {
  const n = safeNext(next, "");
  return n === "/admin" || n.startsWith("/admin/") || n.startsWith("/admin?") ? n : null;
}

function nextQuery(next: unknown): string {
  const n = adminNext(next);
  return n ? `?next=${encodeURIComponent(n)}` : "";
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
export async function setTutorStatus(input: { tutorId: string; status: "pending" | "active" | "paused" | "removed"; reason?: string }): Promise<ActionState> {
  const p = z.object({ tutorId: uuid, status: z.enum(["pending", "active", "paused", "removed"]), reason: z.string().max(500).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Invalid request." } };
  const db = await adminDb();
  const { error } = await db.rpc("admin_set_tutor_status", { p_tutor: p.data.tutorId, p_status: p.data.status, p_reason: p.data.reason || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(`Tutor is now ${p.data.status}.`);
}

export async function eraseAccount(input: { userId: string; reason: string; confirm: string }): Promise<ActionState> {
  const p = z.object({ userId: uuid, reason: z.string().trim().min(3, "Record a reason.").max(500), confirm: z.literal("ERASE", { message: "Type ERASE to confirm." }) }).safeParse(input);
  if (!p.success) return { ok: false, error: { message: p.error.issues[0].message } };
  const db = await adminDb();
  const { data, error } = await db.rpc("admin_erase_account", { p_user: p.data.userId, p_reason: p.data.reason });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message: data === "deleted" ? "Account deleted." : "Personal data erased and sign-in disabled. Lesson dates were kept for the tutor’s hour record.",
  };
}

export async function setRole(input: { email: string; role: "family" | "tutor" | "reviewer" | "admin"; partnerId?: string }): Promise<ActionState> {
  const p = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["family", "tutor", "reviewer", "admin"]), partnerId: uuid.optional().or(z.literal("")) }).safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Enter a valid email." } };
  const db = await adminDb();
  const { data: users, error: findErr } = await db.rpc("admin_find_user", { p_email: p.data.email });
  if (findErr) return { ok: false, error: toActionError(findErr) };
  const user = (users ?? []).find((u) => u.email === p.data.email);
  if (!user) return { ok: false, error: { message: "No account with that email. Ask them to sign up first, then try again." } };
  const { error } = await db.rpc("admin_set_role", { p_user: user.id, p_role: p.data.role, p_partner: p.data.partnerId || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(`${p.data.email} is now ${p.data.role === "admin" ? "an admin" : p.data.role === "family" ? "a family account" : `a ${p.data.role}`}.`);
}

// ---------------------------------------------------------------------------
// Reports, messages, safety
// ---------------------------------------------------------------------------
export async function updateIncident(input: { id: string; status: "open" | "reviewing" | "resolved"; notes?: string }): Promise<ActionState> {
  const p = z.object({ id: uuid, status: z.enum(["open", "reviewing", "resolved"]), notes: z.string().max(4000).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Invalid request." } };
  const db = await adminDb();
  const { error } = await db.rpc("admin_update_incident", { p_incident: p.data.id, p_status: p.data.status, p_notes: p.data.notes || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return ok("Report updated.");
}

export async function hideMessage(input: { id: string; hide: boolean }): Promise<ActionState> {
  if (!uuid.safeParse(input.id).success) return { ok: false, error: { message: "Invalid request." } };
  const db = await adminDb();
  const { error } = await db.rpc("admin_hide_message", { p_message: input.id, p_hide: input.hide });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(input.hide ? "Message hidden." : "Message restored.");
}

/** Hide (or restore) a practice task or note from a student's board while it's reviewed. */
export async function hidePractice(input: { id: string; hide: boolean }): Promise<ActionState> {
  if (!uuid.safeParse(input.id).success) return { ok: false, error: { message: "Invalid request." } };
  const db = await adminDb();
  const { error } = await db.rpc("admin_set_practice_hidden", { p_id: input.id, p_hidden: input.hide });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(input.hide ? "Hidden from the practice board." : "Restored to the practice board.");
}

export async function updateFlag(input: { id: number; status: "open" | "dismissed" | "actioned"; note?: string }): Promise<ActionState> {
  const p = z.object({ id: z.number().int().positive(), status: z.enum(["open", "dismissed", "actioned"]), note: z.string().max(2000).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Invalid request." } };
  const db = await adminDb();
  const { error } = await db.rpc("admin_update_flag", { p_id: p.data.id, p_status: p.data.status, p_note: p.data.note || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(p.data.status === "dismissed" ? "Dismissed." : p.data.status === "actioned" ? "Marked as handled." : "Reopened.");
}

export async function runScanNow(): Promise<ActionState> {
  await adminDb();
  const r = await runSafetyScan("manual");
  revalidatePath("/admin", "layout");
  if (!r.ok) return { ok: false, error: { message: `Scan failed: ${r.error}` } };
  return { ok: true, message: `Scanned ${r.scanned} new message${r.scanned === 1 ? "" : "s"} · ${r.flagged} new flag${r.flagged === 1 ? "" : "s"}.` };
}

/** Runs the automated account check over every tutor now (the same as the daily run). */
export async function runAccountChecksNow(): Promise<ActionState> {
  await adminDb();
  const r = await runAccountChecks({ scope: "all", source: "manual" });
  revalidatePath("/admin", "layout");
  if (!r.ok) return { ok: false, error: { message: `Check failed: ${r.error}` } };
  return { ok: true, message: `Checked ${r.checked} tutor${r.checked === 1 ? "" : "s"} · ${r.verified} verified · ${r.review} to review · ${r.blocked} blocked · ${r.activated} went live.` };
}

// ---------------------------------------------------------------------------
// Lessons & hours
// ---------------------------------------------------------------------------
export async function resolveDispute(input: { sessionId: string; happened: boolean; note: string }): Promise<ActionState> {
  if (!uuid.safeParse(input.sessionId).success || !input.note.trim()) return { ok: false, error: { message: "Add a note explaining the decision." } };
  const db = await adminDb();
  const { error } = await db.rpc("resolve_dispute", { p_session: input.sessionId, p_happened: input.happened, p_note: input.note.trim() });
  if (error) return { ok: false, error: toActionError(error) };
  return ok("Dispute resolved.");
}

export async function reviewHours(input: { ids: string[]; approve: boolean; note?: string }): Promise<ActionState> {
  const p = z.object({ ids: z.array(uuid).min(1, "Select at least one lesson.").max(500), approve: z.boolean(), note: z.string().max(500).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: { message: p.error.issues[0].message } };
  const db = await adminDb();
  const { data, error } = await db.rpc("review_sessions", { p_session_ids: p.data.ids, p_approve: p.data.approve, p_note: p.data.note || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(`${data} lesson${data === 1 ? "" : "s"} ${p.data.approve ? "verified" : "rejected"}.`);
}

// ---------------------------------------------------------------------------
// Partner, settings, email
// ---------------------------------------------------------------------------
const https = z.union([z.literal(""), z.string().trim().url().refine((u) => u.startsWith("https://"), "Links must start with https://")]);
const partner = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(160),
  short_name: z.string().trim().max(40).optional(),
  cause_title: z.string().trim().min(2).max(200),
  cause_description: z.string().trim().max(2000),
  donation_url: https,
  website_url: https,
  partnership_confirmed: z.boolean(),
});

export async function savePartner(input: z.input<typeof partner>): Promise<ActionState> {
  const p = partner.safeParse(input);
  if (!p.success) return { ok: false, error: { message: p.error.issues[0].message } };
  const db = await adminDb();
  const row = {
    name: p.data.name,
    short_name: p.data.short_name || null,
    cause_title: p.data.cause_title,
    cause_description: p.data.cause_description,
    donation_url: p.data.donation_url || null,
    website_url: p.data.website_url || null,
    partnership_confirmed: p.data.partnership_confirmed,
  };
  const { error } = p.data.id ? await db.from("partners").update(row).eq("id", p.data.id) : await db.from("partners").insert(row);
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return ok("Saved.");
}

export async function setCurrentPartner(id: string): Promise<ActionState> {
  if (!uuid.safeParse(id).success) return { ok: false, error: { message: "Invalid request." } };
  const db = await adminDb();
  const { error } = await db.rpc("admin_set_current_partner", { p_partner: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return ok("Current partner updated.");
}

export async function updateSettings(input: { requireApproval: boolean; adminEmails: string }): Promise<ActionState> {
  const emails = input.adminEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const bad = emails.find((e) => !z.string().email().safeParse(e).success);
  if (bad) return { ok: false, error: { message: `“${bad}” isn’t a valid email.` } };
  const db = await adminDb();
  const { error } = await db.rpc("admin_update_settings", {
    p_require_tutor_approval: input.requireApproval,
    p_admin_emails: emails,
  });
  if (error) return { ok: false, error: toActionError(error) };
  return ok("Settings saved.");
}

export async function retryEmail(id: number): Promise<ActionState> {
  const db = await adminDb();
  const { error } = await db.rpc("admin_retry_email", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  return ok("Queued for retry.");
}

export async function sendQueuedNow(): Promise<ActionState> {
  await adminDb();
  const r = await drainOutbox(8);
  revalidatePath("/admin", "layout");
  if (!r.configured) return { ok: false, error: { message: `Email isn’t configured yet (provider: ${r.provider}). Missing: ${r.missing.join(", ")}.` } };
  return { ok: true, message: `Sent ${r.sent}, failed ${r.failed}.` };
}

/** Sends one email straight through the active provider (bypassing the queue) to check the settings. */
export async function sendTestEmail(to: string): Promise<ActionState> {
  const address = to.trim().toLowerCase();
  if (!z.string().email().safeParse(address).success) return { ok: false, error: { message: "Enter a valid email address." } };
  await adminDb();
  const provider = emailProvider();
  const missing = provider.missingConfig();
  if (missing.length) return { ok: false, error: { message: `The ${provider.name} provider is missing: ${missing.join(", ")}.` } };
  try {
    await provider.send({
      to: address,
      email: {
        subject: `Test email from ${SITE.name}`,
        text: `This is a test email sent through the "${provider.name}" provider. If you can read this, email delivery works.`,
        html: `<p>This is a test email sent through the <strong>${provider.name}</strong> provider.</p><p>If you can read this, email delivery works.</p>`,
      },
    });
    return { ok: true, message: `Sent via ${provider.name}. Check ${address} (and the spam folder).` };
  } catch (e) {
    return { ok: false, error: { message: `Sending failed via ${provider.name}: ${e instanceof Error ? e.message : String(e)}` } };
  }
}

// ---------------------------------------------------------------------------
// Public contact form and waitlist
// ---------------------------------------------------------------------------
export async function setContactStatus(input: { id: string; status: "new" | "handled" }): Promise<ActionState> {
  if (!uuid.safeParse(input.id).success || !["new", "handled"].includes(input.status)) return { ok: false, error: { message: "Invalid request." } };
  const db = await adminDb();
  const { error } = await db.rpc("admin_set_contact_status", { p_id: input.id, p_status: input.status });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(input.status === "handled" ? "Marked handled." : "Moved back to new.");
}

export async function removeWaitlistEntry(id: string): Promise<ActionState> {
  if (!uuid.safeParse(id).success) return { ok: false, error: { message: "Invalid request." } };
  const db = await adminDb();
  const { error } = await db.from("interest_signups").delete().eq("id", id);
  if (error) return { ok: false, error: toActionError(error) };
  const { data: me } = await db.auth.getUser();
  await logAppEvent(me.user?.id ?? null, "admin.waitlist_remove", "interest_signup", id);
  return ok("Removed.");
}
