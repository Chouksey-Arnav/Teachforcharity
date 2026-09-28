"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyLessonToken } from "@/lib/links";
import { createServiceClient } from "@/lib/supabase/admin";
import { toActionError, type ActionState } from "@/lib/errors";
import { messageViolation } from "@/lib/moderation";
import { kickEmails } from "@/lib/email/kick";

const input = z.object({ token: z.string().max(200), happened: z.boolean(), note: z.string().trim().max(500).optional() });

/** "Yes, it happened" / "No" from the link in the confirmation email. The signed token is the credential. */
export async function confirmByLink(raw: z.input<typeof input>): Promise<ActionState> {
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, error: { message: "Something was missing. Please try again." } };
  const check = verifyLessonToken(p.data.token);
  if (!check.ok) return { ok: false, error: { message: check.reason === "expired" ? "This link has expired. Sign in to confirm from your dashboard." : "This link isn’t valid." } };
  if (!p.data.happened && !p.data.note) return { ok: false, error: { message: "Please tell us briefly what happened." } };
  const bad = p.data.note ? messageViolation(p.data.note) : null;
  if (bad) return { ok: false, error: { message: `Your note can't include ${bad}.` } };
  const db = createServiceClient();
  if (!db) return { ok: false, error: { message: "Confirmation isn’t available right now. Please try again later." } };
  const { error } = await db.rpc("confirm_session_by_link", { p_session: check.sessionId, p_happened: p.data.happened, p_note: p.data.note || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath(`/confirm/${p.data.token}`);
  return {
    ok: true,
    message: p.data.happened ? "Thank you — confirmed! The tutor’s hours can now be verified." : "Thanks for letting us know. The program team will look into it.",
  };
}
