"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickAccountCheck } from "@/lib/verification/runner";

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("AUTH");
  return { supabase, uid: data.user.id };
}

/** Sets (or clears) the profile photo and deletes the previous file. */
export async function setAvatar(path: string | null): Promise<ActionState> {
  const { supabase, uid } = await session();
  if (path !== null && !new RegExp(`^${uid}/[0-9a-f-]{36}\\.jpg$`).test(path)) {
    return { ok: false, error: { message: "Invalid upload." } };
  }
  const { data: before } = await supabase.from("profiles").select("avatar_path").eq("id", uid).single();
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", uid);
  if (error) return { ok: false, error: toActionError(error) };
  if (before?.avatar_path && before.avatar_path !== path) {
    await supabase.storage.from("avatars").remove([before.avatar_path]);
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const account = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((s) => (s ? s.replace(/[^\d+]/g, "") : ""))
    .refine((s) => s === "" || /^\+?1?\d{10}$/.test(s), "Enter a 10-digit US phone number.")
    .transform((s) => {
      if (!s) return null;
      const d = s.replace(/\D/g, "").slice(-10);
      return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }),
  emailNotifications: z.boolean(),
  weeklyDigest: z.boolean().optional(),
});

export async function updateAccount(input: z.input<typeof account>): Promise<ActionState> {
  const p = account.safeParse(input);
  if (!p.success) return { ok: false, error: { message: p.error.issues[0].message } };
  const { supabase, uid } = await session();
  const { data: me } = await supabase.from("profiles").select("role, account_kind").eq("id", uid).single();
  const student = me?.account_kind === "student";
  if (me?.account_kind === "parent" && !p.data.phone)
    return { ok: false, error: { message: "Families need a phone number so a parent can be reached during lessons." } };
  // Never store a child's phone number: the parent's number lives on the consent form.
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: p.data.fullName,
      phone: student ? null : p.data.phone,
      email_notifications: p.data.emailNotifications,
      ...(p.data.weeklyDigest === undefined ? {} : { weekly_digest: p.data.weeklyDigest }),
    })
    .eq("id", uid);
  if (error) return { ok: false, error: toActionError(error) };
  if (me?.role === "tutor") kickAccountCheck(uid);
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Saved." };
}

export async function setAccepting(accepting: boolean): Promise<ActionState> {
  const { supabase, uid } = await session();
  const { error } = await supabase.from("tutor_profiles").update({ accepting_students: accepting }).eq("user_id", uid);
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: accepting ? "You’re open to new students." : "New students can’t request you right now." };
}

export async function acceptMessagingTerms(): Promise<ActionState> {
  const { supabase } = await session();
  const { error } = await supabase.rpc("accept_terms", { p_kind: "messaging" });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function acceptCurrentTerms(): Promise<ActionState> {
  const { supabase } = await session();
  const { error } = await supabase.rpc("accept_terms", { p_kind: "terms" });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** The public link a tutor gives a school or honor society to check their verified hours. */
export async function setHoursLink(action: "create" | "new" | "off"): Promise<ActionState<{ code: string | null }>> {
  if (!["create", "new", "off"].includes(action)) return { ok: false, error: { message: "Invalid request." } };
  const { supabase } = await session();
  const { data, error } = await supabase.rpc("my_verify_code", { p_action: action });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard/hours");
  const message = action === "off" ? "Link turned off. Anyone who has it now sees “not found.”" : action === "new" ? "New link made. The old one no longer works." : undefined;
  return { ok: true, message, data: { code: (data as string | null) ?? null } };
}
