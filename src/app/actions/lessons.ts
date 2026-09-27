"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { easternToUtc, validateSlot } from "@/lib/time";
import { messageViolation } from "@/lib/moderation";
import { kickEmails } from "@/lib/email/kick";

const uuid = z.string().uuid();
const note = z.string().trim().max(300).optional();

function checkNote(n?: string): string | null {
  if (!n) return null;
  const v = messageViolation(n);
  return v ? `Your note can't include ${v}.` : null;
}

function slotFrom(date: string, time: string, minutes: number): { iso: string } | { error: string } {
  const start = easternToUtc(date, time);
  const problem = validateSlot(start, minutes);
  if (problem || !start) return { error: problem ?? "Please pick a valid date and time." };
  return { iso: start.toISOString() };
}

function done(message?: string): ActionState {
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return { ok: true, message };
}

const requestSchema = z.object({
  studentId: uuid,
  tutorId: uuid,
  subjectId: uuid,
  date: z.string(),
  time: z.string(),
  minutes: z.coerce.number(),
  note,
});

export async function requestLesson(input: z.input<typeof requestSchema>): Promise<ActionState<{ id: string }>> {
  const p = requestSchema.safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Please complete every field." } };
  const bad = checkNote(p.data.note);
  if (bad) return { ok: false, error: { message: bad } };
  const slot = slotFrom(p.data.date, p.data.time, p.data.minutes);
  if ("error" in slot) return { ok: false, error: { message: slot.error } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_session", {
    p_student: p.data.studentId,
    p_tutor: p.data.tutorId,
    p_subject: p.data.subjectId,
    p_start: slot.iso,
    p_minutes: p.data.minutes,
    p_note: p.data.note || undefined,
  });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { id: data as string }, message: "Request sent! We emailed the tutor." };
}

const respondSchema = z.object({
  sessionId: uuid,
  action: z.enum(["accept", "decline", "counter"]),
  date: z.string().optional(),
  time: z.string().optional(),
  minutes: z.coerce.number().optional(),
  note,
});

export async function respondLesson(input: z.input<typeof respondSchema>): Promise<ActionState> {
  const p = respondSchema.safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Something was missing. Please try again." } };
  const bad = checkNote(p.data.note);
  if (bad) return { ok: false, error: { message: bad } };
  let start: string | undefined;
  if (p.data.action === "counter") {
    if (!p.data.date || !p.data.time || !p.data.minutes) return { ok: false, error: { message: "Pick a new date, time, and length." } };
    const slot = slotFrom(p.data.date, p.data.time, p.data.minutes);
    if ("error" in slot) return { ok: false, error: { message: slot.error } };
    start = slot.iso;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_session", {
    p_session: p.data.sessionId,
    p_action: p.data.action,
    p_start: start,
    p_minutes: p.data.action === "counter" ? p.data.minutes : undefined,
    p_note: p.data.note || undefined,
  });
  if (error) return { ok: false, error: toActionError(error) };
  return done(
    p.data.action === "accept" ? "Booked! Confirmation emails are on their way." : p.data.action === "decline" ? "Declined." : "New time sent.",
  );
}

export async function cancelLesson(input: { sessionId: string; reason?: string }): Promise<ActionState> {
  if (!uuid.safeParse(input.sessionId).success) return { ok: false, error: { message: "Lesson not found." } };
  const bad = checkNote(input.reason);
  if (bad) return { ok: false, error: { message: bad } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_session", { p_session: input.sessionId, p_reason: input.reason?.trim().slice(0, 300) || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return done("Cancelled. We let the other side know.");
}

export async function logLesson(input: { sessionId: string; happened: boolean; note?: string }): Promise<ActionState> {
  if (!uuid.safeParse(input.sessionId).success) return { ok: false, error: { message: "Lesson not found." } };
  const bad = checkNote(input.note);
  if (bad) return { ok: false, error: { message: bad } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_session", { p_session: input.sessionId, p_happened: input.happened, p_note: input.note?.trim().slice(0, 500) || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return done(input.happened ? "Logged. We asked the family to confirm." : "Marked as not happened.");
}

export async function confirmLesson(input: { sessionId: string; happened: boolean; note?: string }): Promise<ActionState> {
  if (!uuid.safeParse(input.sessionId).success) return { ok: false, error: { message: "Lesson not found." } };
  const bad = checkNote(input.note);
  if (bad) return { ok: false, error: { message: bad } };
  if (!input.happened && !input.note?.trim()) return { ok: false, error: { message: "Please tell us briefly what happened." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_session", { p_session: input.sessionId, p_happened: input.happened, p_note: input.note?.trim().slice(0, 500) || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  return done(input.happened ? "Thanks — confirmed!" : "Thanks for letting us know. The program team will review it.");
}

export async function offerToTeach(input: { studentId: string; subjectId: string; note?: string }): Promise<ActionState<{ threadId: string }>> {
  const p = z
    .object({ studentId: z.string().uuid(), subjectId: z.string().uuid(), note: z.string().trim().max(300).optional() })
    .safeParse(input);
  if (!p.success) return { ok: false, error: { message: p.error.issues[0]?.message ?? "Please check the form." } };
  if (p.data.note) {
    const v = messageViolation(p.data.note);
    if (v) return { ok: false, error: { message: `Your note can't include ${v}.` } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tutor_offer", { p_student: p.data.studentId, p_subject: p.data.subjectId, p_note: p.data.note || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  // The offer opens a conversation, so the thread list and unread badges change too.
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { threadId: data as string } };
}
