"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/errors";
import { safeNext } from "@/lib/redirect";
import {
  CODE_LENGTH,
  CODE_MESSAGES,
  SETUP_ERROR,
  checkEmailCode,
  clearEmailCode,
  findAuthUser,
  normalizeCode,
  sendEmailCode,
  serviceOrNull,
} from "@/lib/auth/email-code";

const signUpSchema = z.object({
  role: z.enum(["family", "tutor"]),
  fullName: z.string().trim().min(2, "Please enter a full name.").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(72, "Use 72 characters or fewer.")
    .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), "Use at least one letter and one number."),
  eligible: z.literal("on", { message: "Please confirm this to continue." }),
});

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const i of issues) fieldErrors[String(i.path[0])] ??= i.message;
  return fieldErrors;
}

const EXISTS = "An account with that email already exists. Try signing in instead.";

/** Step 1 of sign-up: validate the details and email a 6-digit code. No account is created yet. */
export async function signUp(_: ActionState<{ email: string }>, form: FormData): Promise<ActionState<{ email: string }>> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: { message: "Please fix the highlighted fields." }, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const { email, fullName } = parsed.data;
  const existing = await findAuthUser(email);
  if (existing === "error") return { ok: false, error: SETUP_ERROR };
  if (existing?.confirmed) return { ok: false, error: { message: EXISTS } };

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
  const { role, fullName, email, password } = parsed.data;

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
    user_metadata: { role, full_name: fullName },
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
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    console.error("[auth] sign-in after sign-up failed:", signInErr.message);
    redirect("/login?created=1");
  }
  redirect("/onboarding");
}

/** "Send a new code" on step 2 of sign-up or password reset. */
export async function resendCode(input: { email: string; purpose: "signup" | "reset"; name?: string }): Promise<ActionState> {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: { message: "Please enter a valid email address." } };
  const purpose = input.purpose === "reset" ? "reset" : "signup";
  const existing = await findAuthUser(email);
  if (existing === "error") return { ok: false, error: SETUP_ERROR };
  if (purpose === "signup" && existing?.confirmed) return { ok: false, error: { message: EXISTS } };

  const sent = await sendEmailCode({
    email,
    purpose,
    name: purpose === "signup" ? input.name : null,
    deliver: purpose === "signup" || Boolean(existing),
  });
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ok: true, message: "A new code is on its way." };
}

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { ok: false, error: { message: "Enter your email and password." } };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = /not confirmed/i.test(error.message)
      ? "This email was never verified. Sign up again with the same email to get a code."
      : /rate limit/i.test(error.message)
        ? "Too many attempts. Please wait a few minutes."
        : "That email and password don't match.";
    return { ok: false, error: { message: msg } };
  }
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
  const { error: revokeErr } = await admin.rpc("revoke_user_sessions", { p_user: user.id });
  if (revokeErr) console.error("[auth] could not sign out other devices:", revokeErr.message);

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) redirect("/login?password=updated");
  redirect("/dashboard?password=updated");
}

export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const check = signUpSchema.shape.password.safeParse(password);
  if (!check.success) return { ok: false, error: { message: check.error.issues[0].message } };
  if (password !== confirm) return { ok: false, error: { message: "The two passwords don't match." } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: { message: "Your session expired. Use “Forgot password?” to get a new code." } };
  redirect("/dashboard?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
