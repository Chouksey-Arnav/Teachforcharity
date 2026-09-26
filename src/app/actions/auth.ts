"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";
import type { ActionState } from "@/lib/errors";
import { safeNext } from "@/lib/redirect";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : SITE.url;
}

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

export async function signUp(_: ActionState<{ email: string }>, form: FormData): Promise<ActionState<{ email: string }>> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: { message: "Please fix the highlighted fields." }, fieldErrors };
  }
  const { role, fullName, email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, full_name: fullName },
      emailRedirectTo: `${await origin()}/auth/callback?next=/onboarding`,
    },
  });
  if (error) {
    const msg = /already registered|already exists/i.test(error.message)
      ? "An account with that email already exists. Try signing in instead."
      : /rate limit/i.test(error.message)
        ? "Too many sign-up attempts right now. Please wait a few minutes and try again."
        : /password/i.test(error.message)
          ? error.message
          : "We couldn't create your account. Please try again.";
    return { ok: false, error: { message: msg } };
  }
  // Supabase returns a user with no identities when the email is already taken (to avoid leaking accounts).
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, error: { message: "An account with that email already exists. Try signing in instead." } };
  }
  if (data.session) redirect("/onboarding");
  return { ok: true, data: { email } };
}

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { ok: false, error: { message: "Enter your email and password." } };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = /not confirmed/i.test(error.message)
      ? "Please confirm your email first — check your inbox for the link we sent."
      : /rate limit/i.test(error.message)
        ? "Too many attempts. Please wait a few minutes."
        : "That email and password don't match.";
    return { ok: false, error: { message: msg } };
  }
  redirect(safeNext(form.get("next")));
}

export async function requestPasswordReset(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: { message: "Please enter a valid email address." } };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists.
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const check = signUpSchema.shape.password.safeParse(password);
  if (!check.success) return { ok: false, error: { message: check.error.issues[0].message } };
  if (password !== confirm) return { ok: false, error: { message: "The two passwords don't match." } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: { message: "Your reset link may have expired. Request a new one." } };
  redirect("/dashboard?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
