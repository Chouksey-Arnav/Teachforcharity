"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickEmails } from "@/lib/email/kick";

/**
 * Parent/guardian actions. The parent has no account: the 256-bit token from
 * their emailed link is the credential, and every function re-checks it in the
 * database. Tokens are validated for shape here so junk never reaches the DB.
 */
const token = z.string().regex(/^[0-9a-f]{64}$/);
const phone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[^\d+]/g, ""))
  .refine((s) => /^\+?1?\d{10}$/.test(s), "Enter a 10-digit US phone number.")
  .transform((s) => {
    const d = s.replace(/\D/g, "").slice(-10);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  });
const BAD_LINK: ActionState = { ok: false, error: { message: "This link has expired. Ask for a new one below.", code: "INVALID_LINK" } };

const consentInput = z.object({
  token,
  guardianName: z.string().trim().min(2, "Enter your full name.").max(120),
  relationship: z.string().trim().min(2, "Enter your relationship to the student.").max(40),
  phone,
  signature: z.string().trim().min(2, "Type your full name to sign.").max(120),
  adultGuardian: z.literal(true, { message: "Please confirm you're the parent or legal guardian and 18 or older." }),
  acks: z.array(z.literal(true)).length(6, "Please check every box to give consent."),
  userAgent: z.string().max(400).optional(),
});

export async function guardianSignConsent(input: z.input<typeof consentInput>): Promise<ActionState> {
  const p = consentInput.safeParse(input);
  if (!p.success) {
    if (p.error.issues.some((i) => i.path[0] === "token")) return BAD_LINK;
    const acks = p.error.issues.some((i) => i.path[0] === "acks");
    return { ok: false, error: { message: acks ? "Please check every box to give consent." : p.error.issues[0].message } };
  }
  if (p.data.signature.toLowerCase() !== p.data.guardianName.toLowerCase())
    return { ok: false, error: { message: "Your signature must match your full name exactly." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardian_sign_consent", {
    p_token: p.data.token,
    p_guardian_name: p.data.guardianName,
    p_relationship: p.data.relationship,
    p_phone: p.data.phone,
    p_signature: p.data.signature,
    p_adult_guardian: true,
    p_online_only: true,
    p_no_recording: true,
    p_reachable: true,
    p_incident_process: true,
    p_free_no_payment: true,
    p_messaging_monitoring: true,
    p_user_agent: p.data.userAgent,
  });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath(`/guardian/${p.data.token}`);
  return { ok: true, message: "Thank you — consent is on file. We emailed you a copy." };
}

export async function guardianRevoke(input: { token: string }): Promise<ActionState> {
  if (!token.safeParse(input.token).success) return BAD_LINK;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("guardian_revoke", { p_token: input.token });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath(`/guardian/${input.token}`);
  return { ok: true, message: `Consent withdrawn.${data ? ` ${data} upcoming lesson${data === 1 ? " was" : "s were"} cancelled.` : ""} Messaging and booking are paused.` };
}

const reportInput = z.object({
  token,
  category: z.enum(["safety", "conduct", "no_show", "technical", "other"]),
  description: z.string().trim().min(10, "Please describe what happened (at least 10 characters).").max(4000),
  tutorId: z.string().uuid().optional().or(z.literal("")),
});

export async function guardianReport(input: z.input<typeof reportInput>): Promise<ActionState> {
  const p = reportInput.safeParse(input);
  if (!p.success) return p.error.issues.some((i) => i.path[0] === "token") ? BAD_LINK : { ok: false, error: { message: p.error.issues[0].message } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardian_report", {
    p_token: p.data.token,
    p_category: p.data.category,
    p_description: p.data.description,
    p_tutor: p.data.tutorId || undefined,
  });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath(`/guardian/${p.data.token}`);
  return {
    ok: true,
    message:
      p.data.category === "safety" && p.data.tutorId
        ? "Report received. The tutor was paused immediately and the program team was alerted."
        : "Report received. The program team was alerted and will follow up by email.",
  };
}

export async function guardianDeleteAccount(input: { token: string; confirm: string }): Promise<ActionState> {
  if (!token.safeParse(input.token).success) return BAD_LINK;
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardian_delete_account", { p_token: input.token, p_confirm: String(input.confirm ?? "").slice(0, 60) });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  return { ok: true, message: "The account was deleted." };
}

export async function guardianRequestLink(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: { message: "Enter a valid email address." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardian_request_link", { p_email: email });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  // Same answer whether or not the email is on file.
  return { ok: true, message: "If that email belongs to a parent or guardian on file, a new link is on its way. Check spam if you don’t see it in a few minutes." };
}

// ---------------------------------------------------------------------------
// Parents of tutors: approve (or withdraw approval for) their teen volunteering
// ---------------------------------------------------------------------------
const tutorApproval = z.object({
  token,
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  relationship: z.string().trim().min(2, "Enter your relationship to the tutor.").max(40),
  signature: z.string().trim().min(2, "Type your full name to sign.").max(120),
  adultGuardian: z.literal(true, { message: "Please confirm you're the parent or legal guardian and 18 or older." }),
  readAgreement: z.literal(true, { message: "Please confirm you've read the Tutor Agreement." }),
  understandsFormat: z.literal(true, { message: "Please confirm you understand how lessons work." }),
});

export async function tutorGuardianApprove(input: z.input<typeof tutorApproval>): Promise<ActionState<{ status: string }>> {
  const p = tutorApproval.safeParse(input);
  if (!p.success) {
    if (p.error.issues.some((i) => i.path[0] === "token")) return BAD_LINK;
    return { ok: false, error: { message: p.error.issues[0].message } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tutor_guardian_approve", {
    p_token: p.data.token,
    p_name: p.data.name,
    p_relationship: p.data.relationship,
    p_signature: p.data.signature,
    p_adult_guardian: true,
    p_read_agreement: true,
    p_understands_format: true,
  });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath(`/guardian/tutor/${p.data.token}`);
  return { ok: true, data: { status: data as string } };
}

export async function tutorGuardianWithdraw(input: { token: string }): Promise<ActionState> {
  if (!token.safeParse(input.token).success) return BAD_LINK;
  const supabase = await createClient();
  const { error } = await supabase.rpc("tutor_guardian_withdraw", { p_token: input.token });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath(`/guardian/tutor/${input.token}`);
  return { ok: true, message: "Approval withdrawn. The tutor profile is paused and any upcoming lessons were cancelled." };
}
