"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { MESSAGE_MAX, messageViolation } from "@/lib/moderation";
import { kickEmails } from "@/lib/email/kick";

const uuid = z.string().uuid();

export async function openThread(tutorId: string, studentId: string, template?: string): Promise<ActionState> {
  if (!uuid.safeParse(tutorId).success || !uuid.safeParse(studentId).success) return { ok: false, error: { message: "Not found." } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_thread", { p_tutor: tutorId, p_student: studentId });
  if (error) return { ok: false, error: toActionError(error) };
  if (template) {
    const sent = await supabase.rpc("send_message", { p_thread: data as string, p_template: template });
    if (sent.error) return { ok: false, error: toActionError(sent.error) };
    kickEmails();
  }
  redirect(`/dashboard/messages/${data}`);
}

export async function sendMessage(input: { threadId: string; template?: string; body?: string }): Promise<ActionState> {
  if (!uuid.safeParse(input.threadId).success) return { ok: false, error: { message: "Conversation not found." } };
  if (!input.template) {
    const body = (input.body ?? "").trim();
    if (!body) return { ok: false, error: { message: "Write a message first." } };
    if (body.length > MESSAGE_MAX) return { ok: false, error: { message: `Messages can be up to ${MESSAGE_MAX} characters.` } };
    const v = messageViolation(body);
    if (v) return { ok: false, error: { message: `For everyone's safety, messages can't include ${v}.` } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_message", {
    p_thread: input.threadId,
    p_template: input.template || undefined,
    p_body: input.template ? undefined : input.body?.trim(),
  });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath(`/dashboard/messages/${input.threadId}`);
  return { ok: true };
}

export async function markThreadRead(threadId: string) {
  if (!uuid.safeParse(threadId).success) return;
  const supabase = await createClient();
  await supabase.rpc("mark_thread_read", { p_thread: threadId });
}
