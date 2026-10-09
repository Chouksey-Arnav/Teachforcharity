"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { easternToUtc, validateSlot } from "@/lib/time";
import { messageViolation } from "@/lib/moderation";
import { kickEmails } from "@/lib/email/kick";
import { cleanTasks } from "@/lib/practice";
import { assignPractice } from "./practice";

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
  /** 1 = a single lesson; 2–12 = that many weekly lessons at the same time. */
  weeks: z.coerce.number().int().min(1).max(12).default(1),
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
    p_weeks: p.data.weeks,
  });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    data: { id: data as string },
    message: p.data.weeks > 1 ? `Request for ${p.data.weeks} weekly lessons sent! We emailed the tutor.` : "Request sent! We emailed the tutor.",
  };
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

/** `scope: "rest"` cancels this lesson and every later one in its weekly series. */
export async function cancelLesson(input: { sessionId: string; reason?: string; scope?: "one" | "rest" }): Promise<ActionState> {
  if (!uuid.safeParse(input.sessionId).success) return { ok: false, error: { message: "Lesson not found." } };
  const bad = checkNote(input.reason);
  if (bad) return { ok: false, error: { message: bad } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_session", {
    p_session: input.sessionId,
    p_reason: input.reason?.trim().slice(0, 300) || undefined,
    p_scope: input.scope === "rest" ? "rest" : "one",
  });
  if (error) return { ok: false, error: toActionError(error) };
  return done(data && data > 1 ? `Cancelled ${data} lessons. We let the other side know.` : "Cancelled. We let the other side know.");
}

/**
 * The tutor's log after a lesson. Practice tasks and a note for the student
 * can go with it: they're saved first (so a blocked word stops everything and
 * nothing is half-done), then the lesson is logged.
 */
export async function logLesson(input: {
  sessionId: string;
  happened: boolean;
  note?: string;
  attest: boolean;
  studentId?: string;
  tasks?: string[];
  practiceNote?: string;
  due?: string;
}): Promise<ActionState> {
  if (!uuid.safeParse(input.sessionId).success) return { ok: false, error: { message: "Lesson not found." } };
  if (input.attest !== true) return { ok: false, error: { message: "Please confirm your log is truthful." } };
  const bad = checkNote(input.note);
  if (bad) return { ok: false, error: { message: bad } };
  let added = 0;
  const hasPractice = input.happened && (cleanTasks(input.tasks ?? []).length > 0 || Boolean(input.practiceNote?.trim()));
  if (hasPractice) {
    if (!input.studentId) return { ok: false, error: { message: "Lesson not found." } };
    const r = await assignPractice({ studentId: input.studentId, sessionId: input.sessionId, tasks: input.tasks ?? [], note: input.practiceNote ?? "", due: input.due });
    if (!r?.ok) return { ok: false, error: r?.error ?? { message: "Couldn’t save the practice notes." } };
    added = r.data?.added ?? 0;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_session", {
    p_session: input.sessionId,
    p_happened: input.happened,
    p_note: input.note?.trim().slice(0, 500) || undefined,
    p_attest: true,
  });
  if (error) {
    const e = toActionError(error);
    // The practice notes are already on the board; say so, so they aren't sent twice.
    return { ok: false, error: added ? { ...e, message: `${e.message} (Your practice notes were saved to the board.)` } : e };
  }
  if (!input.happened) return done("Marked as not happened.");
  const practice = added ? ` ${added === 1 ? "1 item is" : `${added} items are`} on the practice board.` : "";
  return done(
    data === "confirmed"
      ? `Logged — your student already confirmed you were there.${practice}`
      : data === "disputed"
        ? "Logged — but your student said you weren’t there. The program team will review it."
        : `Logged.${practice} Your student will be asked to confirm next time they open the site.`,
  );
}

/**
 * The family's check-in after a lesson: was the tutor there? `attest` is the
 * "my answer is truthful" box. Works before or after the tutor logs it.
 */
export async function answerAttendance(input: { sessionId: string; present: boolean; attest: boolean; note?: string }): Promise<ActionState> {
  if (!uuid.safeParse(input.sessionId).success) return { ok: false, error: { message: "Lesson not found." } };
  if (input.attest !== true) return { ok: false, error: { message: "Please confirm your answer is truthful." } };
  const bad = checkNote(input.note);
  if (bad) return { ok: false, error: { message: bad } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_attendance", {
    p_session: input.sessionId,
    p_present: input.present,
    p_attest: true,
    p_note: input.note?.trim().slice(0, 500) || undefined,
  });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: input.present ? "Thanks — you verified the lesson." : "Thanks for telling us. This lesson won’t count, and the program team will look at it.",
  };
}

/** Tutor dismisses the "your student answered" notices they've read. */
export async function ackAttendanceVerdicts(sessionIds: string[]): Promise<ActionState> {
  const ids = sessionIds.filter((x) => uuid.safeParse(x).success).slice(0, 50);
  if (!ids.length) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ack_attendance_verdicts", { p_sessions: ids });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const proposeSchema = z.object({
  studentId: uuid,
  subjectId: uuid,
  date: z.string(),
  time: z.string(),
  minutes: z.coerce.number(),
  note,
  weeks: z.coerce.number().int().min(1).max(12).default(1),
  attest: z.literal(true, { message: "Please confirm you’ll follow the lesson rules." }),
});

/** A tutor proposes a time (or weekly lessons) to a student. Nothing is booked until the family accepts. */
export async function proposeLesson(input: z.input<typeof proposeSchema>): Promise<ActionState<{ id: string }>> {
  const p = proposeSchema.safeParse(input);
  if (!p.success) return { ok: false, error: { message: p.error.issues[0]?.message ?? "Please complete every field." } };
  const bad = checkNote(p.data.note);
  if (bad) return { ok: false, error: { message: bad } };
  const slot = slotFrom(p.data.date, p.data.time, p.data.minutes);
  if ("error" in slot) return { ok: false, error: { message: slot.error } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tutor_propose_session", {
    p_student: p.data.studentId,
    p_subject: p.data.subjectId,
    p_start: slot.iso,
    p_minutes: p.data.minutes,
    p_note: p.data.note || undefined,
    p_weeks: p.data.weeks,
    p_attest: true,
  });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    data: { id: data as string },
    message: p.data.weeks > 1 ? `Proposed ${p.data.weeks} weekly lessons. We emailed the family.` : "Proposed! We emailed the family — it’s booked once they accept.",
  };
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

/** "Email me when a tutor for this instrument joins" (or stop). */
export async function setWaitlist(input: { studentId: string; subjectId: string; on: boolean }): Promise<ActionState> {
  if (!uuid.safeParse(input.studentId).success || !uuid.safeParse(input.subjectId).success) return { ok: false, error: { message: "Invalid request." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_waitlist", { p_student: input.studentId, p_subject: input.subjectId, p_on: input.on });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard/tutors");
  return { ok: true, message: input.on ? "Done — we’ll email you as soon as one joins." : "OK, we won’t email you about this." };
}
