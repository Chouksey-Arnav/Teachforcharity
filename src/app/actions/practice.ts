"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickEmails } from "@/lib/email/kick";
import { kickSafetyScan } from "@/lib/safety/scanner";
import { NOTE_MAX, cleanTasks, draftProblem, practiceProblem } from "@/lib/practice";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const assignSchema = z.object({
  studentId: uuid,
  sessionId: uuid.optional(),
  tasks: z.array(z.string().max(4000)).max(40).default([]),
  note: z.string().max(NOTE_MAX + 200).default(""),
  due: date.optional(),
});
export type AssignInput = z.input<typeof assignSchema>;

/** The database's answer to an assign/update: a count, or what the gate blocked. */
type GateResult = { added?: number; updated?: number; blocked?: string } | null;

/**
 * Puts tasks and a note on a student's practice board. Used on its own and,
 * before logging, from the lesson card. The database re-checks everything
 * (who may write, the message gate) and records blocked attempts.
 */
export async function assignPractice(input: AssignInput): Promise<ActionState<{ added: number }>> {
  const p = assignSchema.safeParse(input);
  if (!p.success) return { ok: false, error: { message: "Please check the practice notes." } };
  const tasks = cleanTasks(p.data.tasks);
  const note = p.data.note.trim();
  const problem = draftProblem(tasks, note);
  // A gate problem still goes to the database so the attempt is recorded; anything else is just fixed here.
  if (problem && !problem.includes("Can’t include")) return { ok: false, error: { message: problem } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_practice", {
    p_student: p.data.studentId,
    p_session: p.data.sessionId ?? null,
    p_tasks: tasks,
    p_note: note || undefined,
    p_due: p.data.due,
  });
  if (error) return { ok: false, error: toActionError(error) };
  const r = data as GateResult;
  if (r?.blocked) return { ok: false, error: { message: problem ?? `Not sent: practice notes can’t include ${r.blocked}.` } };
  kickEmails();
  kickSafetyScan();
  revalidatePath("/dashboard", "layout");
  const added = r?.added ?? 0;
  return { ok: true, data: { added }, message: `Added to the practice board — ${added === 1 ? "it’s" : "they’re"} on your student’s board now.` };
}

export async function updatePractice(input: { id: string; body: string; due?: string | null }): Promise<ActionState> {
  if (!uuid.safeParse(input.id).success) return { ok: false, error: { message: "Not found." } };
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: { message: "Write something first." } };
  if (body.length > NOTE_MAX) return { ok: false, error: { message: "That’s too long." } };
  if (input.due && !date.safeParse(input.due).success) return { ok: false, error: { message: "Pick a valid date." } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_practice", { p_id: input.id, p_body: body, p_due: input.due || undefined });
  if (error) return { ok: false, error: toActionError(error) };
  const r = data as GateResult;
  if (r?.blocked) return { ok: false, error: { message: practiceProblem(body) ?? `Not saved: practice notes can’t include ${r.blocked}.` } };
  kickSafetyScan();
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Saved." };
}

export async function removePractice(id: string): Promise<ActionState> {
  if (!uuid.safeParse(id).success) return { ok: false, error: { message: "Not found." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_practice", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Removed from the board." };
}

/** The student (or their parent) ticks a task off, or back on. */
export async function setPracticeDone(id: string, done: boolean): Promise<ActionState> {
  if (!uuid.safeParse(id).success) return { ok: false, error: { message: "Not found." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_practice_done", { p_id: id, p_done: done });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

