"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickEmails } from "@/lib/email/kick";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), approve: z.boolean(), note: z.string().max(500).optional() });

export async function reviewSessions(input: z.input<typeof schema>): Promise<ActionState> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Select at least one lesson." } };
  if (!p.data.approve && !p.data.note?.trim()) return { ok: false, error: { message: "Please add a reason when rejecting." } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_sessions", { p_session_ids: p.data.ids, p_approve: p.data.approve, p_note: p.data.note || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath("/dashboard", "layout");
  const n = Number(data ?? 0);
  return { ok: true, message: `${p.data.approve ? "Verified" : "Rejected"} ${n} lesson${n === 1 ? "" : "s"}. Tutors were notified.` };
}
