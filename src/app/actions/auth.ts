"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickEmails } from "@/lib/email/kick";
import { safeNext } from "@/lib/redirect";
import {
  CODE_LENGTH,
  CODE_MESSAGES,
  SETUP_ERROR,
  checkEmailCode,
  clearEmailCode,
  clientIp,
  findAuthUser,
  normalizeCode,
  sendAccountExistsNotice,
  sendEmailCode,
  serviceOrNull,
} from "@/lib/auth/email-code";
import { LEAKED_PASSWORD_MESSAGE, isLeakedPassword } from "@/lib/auth/pwned";
import { recordSignInDevice } from "@/lib/auth/sign-in-device";
import { logAppEvent } from "@/lib/audit";
import { cookies } from "next/headers";
import { PUSH_COOKIE } from "@/lib/push/cookie";
import { INVITE_NOTE_MAX, inviteNoteProblem } from "@/lib/safety/invite-note";

const signUpSchema = z.object({
  // Students can't create accounts (a parent signs them up); see requestParentInvite.
  role: z.enum(["family", "tutor"], { message: "Choose one to continue." }),
  fullName: z.string().trim().min(2, "Please enter a full name.").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(72, "Use 72 characters or fewer.")
    .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), "Use at least one letter and one number."),
  eligible: z.literal("on", { message: "Please confirm this to continue." }),
  // First name of the child who invited this parent (from the invitation link), used to pre-fill onboarding.
  invitedChild: z.string().trim().max(40).optional(),
});

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const i of issues) fieldErrors[String(i.path[0])] ??= i.message;
  return fieldErrors;
}

const EXISTS = "We couldn’t create your account. If you already have one, sign in instead.";

/**
 * Step 1 of sign-up: validate the details and email a 6-digit code. No account is created yet.
 * An email that already has an account gets the same response (and a "you already have an
 * account" email instead of a code), so this form can't be used to find out who's signed up.
 */
export async function signUp(_: ActionState<{ email: string }>, form: FormData): Promise<ActionState<{ email: string }>> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: { message: "Please fix the highlighted fields." }, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const { email, fullName, password } = parsed.data;
  if (await isLeakedPassword(password)) {
    return { ok: false, error: { message: "Please fix the highlighted fields." }, fieldErrors: { password: LEAKED_PASSWORD_MESSAGE } };
  }
  const existing = await findAuthUser(email);
  if (existing === "error") return { ok: false, error: SETUP_ERROR };
  if (existing?.confirmed) {
    const notice = await sendAccountExistsNotice(email);
    return notice.ok ? { ok: true, data: { email } } : { ok: false, error: notice.error };
  }

  const sent = await sendEmailCode({ email, purpose: "signup", name: fullName });
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ok: true, data: { email } };
}

/**
 * Step 2 of sign-up: check the code, then create the account (already
 * confirmed) and sign in. The password and role come from THIS request, so
 * only the person holding the inbox decides them.
 */
export async function verifySignup(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: { message: "Something in your details changed. Go back and check them." } };
  const code = normalizeCode(form.get("code"));
  if (!code) return { ok: false, error: { message: `Enter the ${CODE_LENGTH}-digit code from the email.` } };
  const { role, fullName, email, password, invitedChild } = parsed.data;

  const check = await checkEmailCode(email, "signup", code);
  if (check === "error") return { ok: false, error: SETUP_ERROR };
  if (check !== "ok") return { ok: false, error: { message: CODE_MESSAGES[check], code: check.toUpperCase() } };

  const admin = serviceOrNull();
  const existing = await findAuthUser(email);
  if (!admin || existing === "error") return { ok: false, error: SETUP_ERROR };
  if (existing?.confirmed) return { ok: false, error: { message: EXISTS } };
  if (existing) {
    // A leftover never-verified account (from the old link flow). Nobody could
    // ever sign in to it, so replace it with the one this person just verified.
    const { error } = await admin.auth.admin.deleteUser(existing.id);
    if (error) {
      console.error("[auth] could not remove unverified user:", error.message);
      return { ok: false, error: { message: "We couldn’t create your account. Please try again." } };
    }
  }

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, full_name: fullName, ...(role === "family" && invitedChild ? { invited_child: invitedChild } : {}) },
  });
  if (createErr) {
    console.error("[auth] createUser failed:", createErr.message);
    const msg = /already|exists|registered/i.test(createErr.message)
      ? EXISTS
      : /password/i.test(createErr.message)
        ? createErr.message
        : "We couldn’t create your account. Please try again.";
    return { ok: false, error: { message: msg } };
  }
  await clearEmailCode(email, "signup");

  const supabase = await createClient();
  const { data: signedIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    console.error("[auth] sign-in after sign-up failed:", signInErr.message);
    redirect("/login?created=1");
  }
  await recordSignInDevice(signedIn.user.id);
  redirect("/onboarding");
}

const parentInviteSchema = z.object({
  childFirst: z
    .string()
    .trim()
    .min(1, "Enter your first name.")
    .max(40, "Just your first name, please.")
    .refine((v) => !/[0-9@/:]/.test(v), "Just your first name, please."),
  parentEmail: z.string().trim().toLowerCase().email("Enter your parent or guardian’s email address."),
  // Optional. Screened here (message filter + safety analyzer) and again by the database.
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

/**
 * "I'm a student": the only thing a middle schooler can do on the sign-up page.
 * We email their parent an invitation (with the student's optional note) that
 * links to a page about the request; we keep just the parent's email, the
 * child's first name and the note, and delete them after 14 days.
 */
export async function requestParentInvite(
  _: ActionState<{ parentEmail: string; childFirst: string; status: "sent" | "already_sent" }>,
  form: FormData,
): Promise<ActionState<{ parentEmail: string; childFirst: string; status: "sent" | "already_sent" }>> {
  const parsed = parentInviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: { message: "Please fix the highlighted fields." }, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const admin = serviceOrNull();
  if (!admin) return { ok: false, error: SETUP_ERROR };
  const ip = await clientIp();
  const { data: sent, error } = await admin.rpc("request_parent_invite", {
    p_child_first: parsed.data.childFirst,
    p_parent_email: parsed.data.parentEmail,
    p_ip_hash: ip ? createHash("sha256").update(`tfac-invite:${ip}`).digest("hex") : undefined,
    p_note: parsed.data.note || undefined,
  });
  if (error) {
    if (error.hint === "BAD_NAME") return { ok: false, error: { message: error.message }, fieldErrors: { childFirst: error.message } };
    if (error.hint === "BAD_EMAIL") return { ok: false, error: { message: error.message }, fieldErrors: { parentEmail: error.message } };
    if (error.hint === "BAD_NOTE") return { ok: false, error: { message: error.message }, fieldErrors: { note: error.message } };
    // Log the real cause (e.g. a missing database function after a skipped migration) so it shows up in server logs.
    console.error("[auth] request_parent_invite failed:", error.code, error.message);
    return { ok: false, error: toActionError(error, "We couldn’t send that right now. Please try again.") };
  }
  kickEmails();
  // "already_sent": this parent was emailed in the last 10 minutes (or 3 times today), so nothing new went out.
  return { ok: true, data: { parentEmail: parsed.data.parentEmail, childFirst: parsed.data.childFirst, status: sent === "already_sent" ? "already_sent" : "sent" } };
}

/** "Send a new code" on step 2 of sign-up or password reset. */
export async function resendCode(input: { email: string; purpose: "signup" | "reset"; name?: string }): Promise<ActionState> {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: { message: "Please enter a valid email address." } };
  const purpose = input.purpose === "reset" ? "reset" : "signup";
  const existing = await findAuthUser(email);
  if (existing === "error") return { ok: false, error: SETUP_ERROR };
  if (purpose === "signup" && existing?.confirmed) {
    const notice = await sendAccountExistsNotice(email);
    return notice.ok ? { ok: true, message: "A new code is on its way." } : { ok: false, error: notice.error };
  }

  const sent = await sendEmailCode({
    email,
    purpose,
    name: purpose === "signup" ? input.name : null,
    deliver: purpose === "signup" || Boolean(existing),
  });
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ok: true, message: "A new code is on its way." };
}

export async function signIn(_: ActionState<{ email: string }>, form: FormData): Promise<ActionState<{ email: string }>> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { ok: false, error: { message: "Enter your email and password." }, data: { email } };
  const supabase = await createClient();
  const { data: signedIn, error } = await supabase.auth.signInWithPassword({ email, password });
  await logAppEvent(signedIn?.user?.id ?? null, error ? "auth.sign_in_failed" : "auth.sign_in", "profile", signedIn?.user?.id ?? null, error ? { email } : {});
  if (error) {
    const msg = /not confirmed/i.test(error.message)
      ? "This email was never verified. Sign up again with the same email to get a code."
      : /rate limit/i.test(error.message)
        ? "Too many attempts. Please wait a few minutes."
        : "That email and password don't match.";
    return { ok: false, error: { message: msg }, data: { email } };
  }
  await recordSignInDevice(signedIn.user.id);
  redirect(safeNext(form.get("next")));
}

/** Step 1 of a password reset: email a code. Responds the same whether or not the account exists. */
export async function requestPasswordReset(_: ActionState<{ email: string }>, form: FormData): Promise<ActionState<{ email: string }>> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: { message: "Please enter a valid email address." } };
  const existing = await findAuthUser(email);
  if (existing === "error") return { ok: false, error: SETUP_ERROR };
  // A code is issued either way so rate limits (and timing of errors) don't reveal who has an account.
  const sent = await sendEmailCode({ email, purpose: "reset", deliver: Boolean(existing) });
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ok: true, data: { email } };
}

/** Step 2 of a password reset: check the code, set the new password, sign out other devices, sign in here. */
export async function resetPasswordWithCode(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const code = normalizeCode(form.get("code"));
  if (!code) return { ok: false, error: { message: `Enter the ${CODE_LENGTH}-digit code from the email.`, code: "BAD_CODE" } };
  const pw = signUpSchema.shape.password.safeParse(password);
  if (!pw.success) return { ok: false, error: { message: pw.error.issues[0].message } };
  if (password !== confirm) return { ok: false, error: { message: "The two passwords don’t match." } };
  if (await isLeakedPassword(password)) return { ok: false, error: { message: LEAKED_PASSWORD_MESSAGE } };

  const check = await checkEmailCode(email, "reset", code);
  if (check === "error") return { ok: false, error: SETUP_ERROR };
  if (check !== "ok") return { ok: false, error: { message: CODE_MESSAGES[check], code: check.toUpperCase() } };

  const admin = serviceOrNull();
  const user = await findAuthUser(email);
  if (!admin || user === "error") return { ok: false, error: SETUP_ERROR };
  if (!user) return { ok: false, error: { message: CODE_MESSAGES.invalid, code: "INVALID" } };

  // Proving the inbox also confirms the email for any old never-verified account.
  const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) {
    console.error("[auth] password reset failed:", error.message);
    return { ok: false, error: { message: /password/i.test(error.message) ? error.message : "We couldn’t update your password. Please try again." } };
  }
  await clearEmailCode(email, "reset");
  await logAppEvent(user.id, "auth.password_reset", "profile", user.id);
  const { error: revokeErr } = await admin.rpc("revoke_user_sessions", { p_user: user.id });
  if (revokeErr) console.error("[auth] could not sign out other devices:", revokeErr.message);

  const supabase = await createClient();
  const { data: signedIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) redirect("/login?password=updated");
  await recordSignInDevice(signedIn.user.id);
  redirect("/dashboard?password=updated");
}

export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const check = signUpSchema.shape.password.safeParse(password);
  if (!check.success) return { ok: false, error: { message: check.error.issues[0].message } };
  if (password !== confirm) return { ok: false, error: { message: "The two passwords don't match." } };
  if (await isLeakedPassword(password)) return { ok: false, error: { message: LEAKED_PASSWORD_MESSAGE } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: { message: "Your session expired. Use “Forgot password?” to get a new code." } };
  redirect("/dashboard?password=updated");
}

/** Signs this account out on every device (e.g. after using a shared computer). */
export async function signOutEverywhere() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await logAppEvent(data.user.id, "auth.sign_out_everywhere", "profile", data.user.id);
  if (data.user) await supabase.rpc("forget_push_devices");
  (await cookies()).delete(PUSH_COOKIE);
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?signedout=everywhere");
}

export async function signOut() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await logAppEvent(data.user.id, "auth.sign_out", "profile", data.user.id);
  // Stop this device's notifications: the next person to use it shouldn't see them.
  const jar = await cookies();
  const pushId = jar.get(PUSH_COOKIE)?.value;
  if (data.user && pushId && /^[0-9a-f-]{36}$/.test(pushId)) await supabase.from("push_subscriptions").delete().eq("id", pushId);
  jar.delete(PUSH_COOKIE);
  await supabase.auth.signOut();
  redirect("/");
}
