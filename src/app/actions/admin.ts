"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickEmails } from "@/lib/email/kick";
import { drainOutbox } from "@/lib/email/worker";

const uuid = z.string().uuid();

function ok(message?: string): ActionState {
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return { ok: true, message };
}

export async function setTutorStatus(input: { tutorId: string; status: "pending" | "active" | "paused" | "removed"; reason?: string }): Promise<ActionState> {
  const p = z.object({ tutorId: uuid, status: z.enum(["pending", "active", "paused", "removed"]), reason: z.string().max(500).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Invalid request." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_tutor_status", { p_tutor: p.data.tutorId, p_status: p.data.status, p_reason: p.data.reason || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(`Tutor is now ${p.data.status}.`);
}

export async function updateIncident(input: { id: string; status: "open" | "reviewing" | "resolved"; notes?: string }): Promise<ActionState> {
  const p = z.object({ id: uuid, status: z.enum(["open", "reviewing", "resolved"]), notes: z.string().max(4000).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Invalid request." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_incident", { p_incident: p.data.id, p_status: p.data.status, p_notes: p.data.notes || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return ok("Report updated.");
}

export async function hideMessage(input: { id: string; hide: boolean }): Promise<ActionState> {
  if (!uuid.safeParse(input.id).success) return { ok: false, error: { message: "Invalid request." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_hide_message", { p_message: input.id, p_hide: input.hide });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(input.hide ? "Message hidden." : "Message restored.");
}

export async function resolveDispute(input: { sessionId: string; happened: boolean; note: string }): Promise<ActionState> {
  if (!uuid.safeParse(input.sessionId).success || !input.note.trim()) return { ok: false, error: { message: "Add a note explaining the decision." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_dispute", { p_session: input.sessionId, p_happened: input.happened, p_note: input.note.trim() });
  if (error) return { ok: false, error: toActionError(error) };
  return ok("Dispute resolved.");
}

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
  const supabase = await createClient();
  const row = {
    name: p.data.name,
    short_name: p.data.short_name || null,
    cause_title: p.data.cause_title,
    cause_description: p.data.cause_description,
    donation_url: p.data.donation_url || null,
    website_url: p.data.website_url || null,
    partnership_confirmed: p.data.partnership_confirmed,
  };
  const { error } = p.data.id ? await supabase.from("partners").update(row).eq("id", p.data.id) : await supabase.from("partners").insert(row);
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return ok("Saved.");
}

export async function setCurrentPartner(id: string): Promise<ActionState> {
  if (!uuid.safeParse(id).success) return { ok: false, error: { message: "Invalid request." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_current_partner", { p_partner: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return ok("Current partner updated.");
}

export async function updateSettings(input: { requireApproval: boolean; adminEmails: string }): Promise<ActionState> {
  const emails = input.adminEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const bad = emails.find((e) => !z.string().email().safeParse(e).success);
  if (bad) return { ok: false, error: { message: `“${bad}” isn’t a valid email.` } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_settings", { p_require_tutor_approval: input.requireApproval, p_admin_emails: emails });
  if (error) return { ok: false, error: toActionError(error) };
  return ok("Settings saved.");
}

export async function setRole(input: { email: string; role: "family" | "tutor" | "reviewer" | "admin"; partnerId?: string }): Promise<ActionState> {
  const p = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["family", "tutor", "reviewer", "admin"]), partnerId: uuid.optional().or(z.literal("")) }).safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Enter a valid email." } };
  const supabase = await createClient();
  const { data: users, error: findErr } = await supabase.rpc("admin_find_user", { p_email: p.data.email });
  if (findErr) return { ok: false, error: toActionError(findErr) };
  const user = (users ?? []).find((u) => u.email === p.data.email);
  if (!user) return { ok: false, error: { message: "No account with that email. Ask them to sign up first (as a family), then try again." } };
  const { error } = await supabase.rpc("admin_set_role", { p_user: user.id, p_role: p.data.role, p_partner: p.data.partnerId || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return ok(`${p.data.email} is now ${p.data.role === "admin" ? "an admin" : `a ${p.data.role}`}.`);
}

export async function retryEmail(id: number): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_retry_email", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  return ok("Queued for retry.");
}

export async function sendQueuedNow(): Promise<ActionState> {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("admin_overview");
  if (!isAdmin) return { ok: false, error: { message: "Admins only." } };
  const r = await drainOutbox(8);
  revalidatePath("/dashboard/admin/emails");
  if (!r.configured) return { ok: false, error: { message: "Email isn’t configured yet: set SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, and BREVO_SENDER_EMAIL in Vercel." } };
  return { ok: true, message: `Sent ${r.sent}, failed ${r.failed}.` };
}
