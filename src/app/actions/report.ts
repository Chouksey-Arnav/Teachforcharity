"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickEmails } from "@/lib/email/kick";

const schema = z.object({
  category: z.enum(["safety", "conduct", "no_show", "technical", "other"]),
  description: z.string().trim().min(10, "Please describe what happened (at least a sentence).").max(4000),
  tutorId: z.string().uuid().optional().or(z.literal("")),
  studentId: z.string().uuid().optional().or(z.literal("")),
  sessionId: z.string().uuid().optional().or(z.literal("")),
  messageId: z.string().uuid().optional().or(z.literal("")),
});

export async function submitReport(input: z.input<typeof schema>): Promise<ActionState> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: { message: p.error.issues[0].message } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_incident", {
    p_category: p.data.category,
    p_description: p.data.description,
    p_tutor: p.data.tutorId || undefined,
    p_student: p.data.studentId || undefined,
    p_session: p.data.sessionId || undefined,
    p_message: p.data.messageId || undefined,
  });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Thank you. Your report was sent to the program team." };
}
