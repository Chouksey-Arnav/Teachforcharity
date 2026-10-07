"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clientIp, serviceOrNull } from "@/lib/auth/email-code";
import { kickEmails } from "@/lib/email/kick";
import { toActionError, type ActionState } from "@/lib/errors";
import { INVITE_NOTE_MAX, inviteNoteProblem } from "@/lib/safety/invite-note";
import { CONTACT_ROLES, CONTACT_TOPICS, US_STATES, WAITLIST_GRADES } from "@/lib/public-forms";
import { SITE } from "@/lib/site";

const UNAVAILABLE = { message: "This form isn’t working right now. Please try again in a little while." };

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const i of issues) fieldErrors[String(i.path[0])] ??= i.message;
  return fieldErrors;
}

async function ipHash(scope: string): Promise<string | undefined> {
  const ip = await clientIp();
  return ip ? createHash("sha256").update(`tfac-${scope}:${ip}`).digest("hex") : undefined;
}

/** Bots fill every field; people never see this one. Named so browsers never autofill it (a "company" field would be). */
const honeypot = (form: FormData) => String(form.get("hp_leave_blank") ?? "").trim() !== "";

// ---------------------------------------------------------------------------
// Waitlist
// ---------------------------------------------------------------------------

const waitlistSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a parent or guardian’s email address.").max(254),
    reason: z.enum(["instrument", "region", "grade"], { message: "Choose what you’re waiting for." }),
    instrument: z.string().trim().max(60).optional(),
    region: z.string().trim().toUpperCase().optional(),
    grade: z.coerce.number().int().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.reason === "instrument" && !v.instrument) ctx.addIssue({ code: "custom", path: ["instrument"], message: "Choose an instrument." });
    if (v.reason === "region" && !US_STATES.some((s) => s.code === v.region)) ctx.addIssue({ code: "custom", path: ["region"], message: "Choose your state." });
    if (v.reason === "grade" && !WAITLIST_GRADES.some((g) => g.value === v.grade)) ctx.addIssue({ code: "custom", path: ["grade"], message: "Choose a grade." });
  });

export type WaitlistResult = { status: "added" | "open"; email: string; reason: "instrument" | "region" | "grade" };

/**
 * "Email me when a tutor for my instrument joins" (and "not eligible yet") — no account needed. Nothing is emailed
 * now, so this form can't be used to send mail to a stranger; the one email comes when a matching tutor goes live.
 */
export async function joinWaitlist(_: ActionState<WaitlistResult>, form: FormData): Promise<ActionState<WaitlistResult>> {
  const parsed = waitlistSchema.safeParse({
    email: form.get("email") ?? "",
    reason: form.get("reason") ?? "",
    instrument: form.get("instrument") || undefined,
    region: form.get("region") || undefined,
    grade: form.get("grade") || undefined,
  });
  if (!parsed.success) return { ok: false, error: { message: "Please fix the highlighted fields." }, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const { email, reason, instrument, region, grade } = parsed.data;
  if (honeypot(form)) return { ok: true, data: { status: "added", email, reason } };

  const admin = serviceOrNull();
  if (!admin) return { ok: false, error: UNAVAILABLE };
  const { data, error } = await admin.rpc("join_interest_list", {
    p_email: email,
    p_reason: reason,
    p_subject_slug: reason === "instrument" ? instrument : undefined,
    p_region: reason === "region" ? region : undefined,
    p_grade: reason === "grade" ? grade : undefined,
    p_ip_hash: await ipHash("waitlist"),
  });
  if (error) {
    const fe: Record<string, string> = {};
    if (error.hint === "BAD_EMAIL") fe.email = error.message;
    if (error.hint === "BAD_SUBJECT") fe.instrument = error.message;
    if (error.hint === "BAD_REGION") fe.region = error.message;
    if (error.hint === "BAD_GRADE") fe.grade = error.message;
    if (Object.keys(fe).length) return { ok: false, error: { message: error.message }, fieldErrors: fe };
    console.error("[waitlist] join_interest_list failed:", error.code, error.message);
    return { ok: false, error: toActionError(error, UNAVAILABLE.message) };
  }
  // "updated" (already on this list) is reported as "added": the answer must not reveal whether an address was there.
  const status = data === "open" ? "open" : "added";
  return { ok: true, data: { status, email, reason } };
}

/** The removal link in a waitlist email. */
export async function leaveWaitlist(token: string): Promise<boolean> {
  if (!/^[0-9a-f]{32}$/.test(token)) return false;
  const admin = serviceOrNull();
  if (!admin) return false;
  const { data, error } = await admin.rpc("leave_interest_list", { p_token: token });
  if (error) console.error("[waitlist] leave_interest_list failed:", error.code, error.message);
  return data === true;
}

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  topic: z.enum(CONTACT_TOPICS.map((t) => t.key) as [string, ...string[]], { message: "Choose what this is about." }),
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter an email address we can reply to.").max(254),
  role: z.enum(CONTACT_ROLES.map((r) => r.key) as [string, ...string[]]).optional(),
  message: z.string().trim().min(10, "Please tell us a little more (at least 10 characters).").max(4000, "Please keep it under 4,000 characters."),
});

/** /contact: reaches the program team without an account. The message stays on the site; admins are emailed that it arrived. */
export async function sendContactMessage(_: ActionState<{ topic: string }>, form: FormData): Promise<ActionState<{ topic: string }>> {
  const parsed = contactSchema.safeParse({
    topic: form.get("topic") ?? "",
    name: form.get("name") ?? "",
    email: form.get("email") ?? "",
    role: form.get("role") || undefined,
    message: form.get("message") ?? "",
  });
  if (!parsed.success) return { ok: false, error: { message: "Please fix the highlighted fields." }, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const v = parsed.data;
  if (honeypot(form)) return { ok: true, data: { topic: v.topic } };

  const admin = serviceOrNull();
  if (!admin) return { ok: false, error: UNAVAILABLE };
  // Signed in? Attach the account, so the team can see who it is without asking.
  const { data: auth } = await (await createClient()).auth.getUser();
  const { error } = await admin.rpc("submit_contact_message", {
    p_topic: v.topic,
    p_name: v.name,
    p_email: v.email,
    p_role: v.role,
    p_message: v.message,
    p_user: auth.user?.id,
    p_ip_hash: await ipHash("contact"),
  });
  if (error) {
    console.error("[contact] submit_contact_message failed:", error.code, error.message);
    return { ok: false, error: toActionError(error, UNAVAILABLE.message) };
  }
  kickEmails();
  return { ok: true, data: { topic: v.topic } };
}

// ---------------------------------------------------------------------------
// Student: a link to text a parent instead of typing their email
// ---------------------------------------------------------------------------

const linkSchema = z.object({
  childFirst: z
    .string()
    .trim()
    .min(1, "Enter your first name.")
    .max(40, "Just your first name, please.")
    .refine((v) => !/[0-9@/:]/.test(v), "Just your first name, please."),
  note: z
    .string()
    .trim()
    .max(INVITE_NOTE_MAX, `Keep your note to ${INVITE_NOTE_MAX} characters.`)
    .optional()
    .superRefine((v, ctx) => {
      const why = v ? inviteNoteProblem(v) : null;
      if (why) ctx.addIssue({ code: "custom", message: why });
    }),
});

export async function createParentInviteLink(input: { childFirst: string; note?: string }): Promise<ActionState<{ url: string }>> {
  const parsed = linkSchema.safeParse({ childFirst: input.childFirst ?? "", note: input.note || undefined });
  if (!parsed.success) return { ok: false, error: { message: "Please fix the highlighted fields." }, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const admin = serviceOrNull();
  if (!admin) return { ok: false, error: UNAVAILABLE };
  const { data, error } = await admin.rpc("create_parent_invite_link", {
    p_child_first: parsed.data.childFirst,
    p_note: parsed.data.note || undefined,
    p_ip_hash: await ipHash("invite"),
  });
  if (error || typeof data !== "string") {
    if (error?.hint === "BAD_NAME") return { ok: false, error: { message: error.message }, fieldErrors: { childFirst: error.message } };
    if (error?.hint === "BAD_NOTE") return { ok: false, error: { message: error.message }, fieldErrors: { note: error.message } };
    console.error("[invite] create_parent_invite_link failed:", error?.code, error?.message);
    return { ok: false, error: toActionError(error, UNAVAILABLE.message) };
  }
  return { ok: true, data: { url: `${SITE.url}/invite/${data}` } };
}
