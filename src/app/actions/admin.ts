"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickEmails } from "@/lib/email/kick";
import { drainOutbox } from "@/lib/email/worker";
import { emailProvider } from "@/lib/email/provider";
import { SITE } from "@/lib/site";
import { adminDb, clearAdminCookie, passwordMatches, setAdminCookie } from "@/lib/admin/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/auth/email-code";
import { runSafetyScan } from "@/lib/safety/scanner";

/**
 * Admin console actions. Every one goes through adminDb(), which requires the
 * signed admin cookie before handing out the service-role client — and every
 * admin database function re-checks the caller on its own.
 */
const uuid = z.string().uuid();

function ok(message?: string): ActionState {
  kickEmails();
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------
export async function adminLogin(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  const db = createServiceClient();
  if (!db) return { ok: false, error: { message: "The server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel and redeploy." } };
  const ip = (await clientIp()) ?? "unknown";
  const { data: allowed, error } = await db.rpc("admin_login_allowed", { p_ip: ip });
  if (error) return { ok: false, error: { message: "Sign-in is unavailable right now. Try again shortly." } };
  if (!allowed) return { ok: false, error: { message: "Too many attempts. Wait 15 minutes and try again." } };
  const good = password.length > 0 && passwordMatches(password);
  await db.rpc("admin_login_record", { p_ip: ip, p_ok: good });
  if (!good) {
    await new Promise((r) => setTimeout(r, 400)); // slows guessing a little more
    return { ok: false, error: { message: "That password isn’t right." } };
  }
  await setAdminCookie();
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
}

export async function adminLogout() {
  await clearAdminCookie();
  redirect("/admin/login");
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
  await db.rpc("log_app_event", { p_actor: null as unknown as string, p_action: "partner.save", p_target_type: "partner", p_target_id: (p.data.id ?? "new") as string, p_data: row as never });
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
  const { error } = await db.rpc("admin_update_settings", { p_require_tutor_approval: input.requireApproval, p_admin_emails: emails });
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
