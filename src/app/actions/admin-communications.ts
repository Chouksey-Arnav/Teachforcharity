"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { MESSAGE_MAX, messageViolation } from "@/lib/moderation";
import { kickSafetyScan } from "@/lib/safety/scanner";

const uuid = z.string().uuid();

export async function sendAdminCommunication(input: { studentId?: string; all: boolean; body: string }): Promise<ActionState> {
  if (!input || typeof input.body !== "string" || typeof input.all !== "boolean" || (input.all ? Boolean(input.studentId) : !uuid.safeParse(input.studentId).success)) {
    return { ok: false, error: { message: "Choose a recipient." } };
  }
  const body = input.body.trim();
  if (!body || body.length > MESSAGE_MAX) return { ok: false, error: { message: `Write a message of up to ${MESSAGE_MAX} characters.` } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_comms_send", { p_student: input.all ? null : input.studentId!, p_all: input.all, p_body: body });
  if (error) return { ok: false, error: toActionError(error) };
  if (data) kickSafetyScan();
  revalidatePath("/dashboard/messages");
  revalidatePath("/admin/communications");
  return { ok: true, message: data === 0 ? "No eligible recipients; nothing was sent." : `Sent to ${data} ${data === 1 ? "conversation" : "conversations"}.` };
}

export async function replyAdminCommunication(threadId: string, text: string): Promise<ActionState> {
  if (!uuid.safeParse(threadId).success || typeof text !== "string") return { ok: false, error: { message: "Conversation not found." } };
  const body = text.trim();
  if (!body || body.length > MESSAGE_MAX) return { ok: false, error: { message: `Write a message of up to ${MESSAGE_MAX} characters.` } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_comms_reply", { p_thread: threadId, p_body: body });
  if (error) return { ok: false, error: toActionError(error) };
  kickSafetyScan();
  revalidatePath(`/admin/communications/${threadId}`);
  revalidatePath("/admin/communications");
  revalidatePath("/dashboard/messages");
  return { ok: true, message: "Message sent." };
}

export async function markAdminCommunicationRead(threadId: string): Promise<void> {
  if (!uuid.safeParse(threadId).success) return;
  const supabase = await createClient();
  await supabase.rpc("admin_comms_mark_read", { p_thread: threadId });
}

export async function replyFamilyCommunication(threadId: string, text: string): Promise<ActionState> {
  if (!uuid.safeParse(threadId).success || typeof text !== "string") return { ok: false, error: { message: "Conversation not found." } };
  const body = text.trim();
  if (!body || body.length > MESSAGE_MAX) return { ok: false, error: { message: `Write a message of up to ${MESSAGE_MAX} characters.` } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("family_comms_send", { p_thread: threadId, p_body: body });
  if (error) return { ok: false, error: toActionError(error) };
  if (!data) return { ok: false, error: { message: `Not sent. For everyone’s safety, messages can’t include ${messageViolation(body, "family") ?? "restricted content"}.` } };
  kickSafetyScan();
  revalidatePath("/dashboard/messages");
  return { ok: true };
}
