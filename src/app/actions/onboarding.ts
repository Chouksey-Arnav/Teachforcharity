"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { ALL_SLOTS, GOALS, INTERESTS, LEVELS, NC_COUNTIES } from "@/lib/constants";
import { normalizeMeetUrl } from "@/lib/meet";
import { kickEmails } from "@/lib/email/kick";

type Supa = Awaited<ReturnType<typeof createClient>>;

const phone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[^\d+]/g, ""))
  .refine((s) => /^\+?1?\d{10}$/.test(s), "Enter a 10-digit US phone number.")
  .transform((s) => {
    const d = s.replace(/\D/g, "").slice(-10);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  });
const slots = z.array(z.enum(ALL_SLOTS as [string, ...string[]])).max(35);
const level = z.enum(LEVELS);
const style = z.enum(["structured", "flexible", "balanced"]);
const explain = z.enum(["show", "tell", "balanced"]);
const county = z.union([z.enum(NC_COUNTIES), z.literal("")]).optional();
const goalKeys = GOALS.map((g) => g.key) as [string, ...string[]];
const interestKeys = INTERESTS.map((i) => i.key) as [string, ...string[]];
const interests = z.array(z.enum(interestKeys)).max(6, "Pick up to 6.").optional();

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("AUTH");
  return { supabase, uid: data.user.id };
}

function invalid(error: z.ZodError): ActionState<never> {
  return { ok: false, error: { message: error.issues[0]?.message ?? "Please check the form." } };
}

async function resolveSubjectId(supabase: Supa, item: { subjectId?: string | null; name: string; family?: string }) {
  if (item.subjectId) return { id: item.subjectId };
  const { data, error } = await supabase.rpc("resolve_subject", { p_name: item.name, p_family: item.family ?? "other" });
  if (error || !data) return { error: toActionError(error, "We couldn't add that instrument.") };
  return { id: (data as { id: string }).id };
}

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------
const familyAbout = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name.").max(120),
  phone,
  isGuardian: z.literal(true, { message: "Please confirm you're the parent or legal guardian." }),
  acceptTerms: z.literal(true, { message: "Please agree to the Terms and Privacy Policy." }),
});

export async function saveFamilyAbout(input: z.input<typeof familyAbout>): Promise<ActionState> {
  const p = familyAbout.safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  const { error } = await supabase.from("profiles").update({ full_name: p.data.fullName, phone: p.data.phone }).eq("id", uid);
  if (error) return { ok: false, error: toActionError(error) };
  const a = await supabase.rpc("attest_guardian");
  if (a.error) return { ok: false, error: toActionError(a.error) };
  const t = await supabase.rpc("accept_terms", { p_kind: "terms" });
  if (t.error) return { ok: false, error: toActionError(t.error) };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Student account (a middle schooler signing up themselves)
// ---------------------------------------------------------------------------
const studentSelf = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Please enter your first name.")
    .max(40)
    .refine((s) => !/\s\S+\s\S+/.test(s), "First name only, please."),
  grade: z.coerce.number().int().min(6, "This program is for grades 6–8.").max(8, "This program is for grades 6–8."),
  county,
  guardianName: z.string().trim().min(2, "Enter your parent or guardian's name.").max(120),
  guardianEmail: z.string().trim().toLowerCase().email("Enter your parent or guardian's email address."),
  acceptTerms: z.literal(true, { message: "Please agree to the Terms and Privacy Policy." }),
});

export async function saveStudentSelf(input: z.input<typeof studentSelf>): Promise<ActionState<{ id: string; invited: boolean }>> {
  const p = studentSelf.safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  const { data: me } = await supabase.from("profiles").select("account_kind, email").eq("id", uid).single();
  if (me?.account_kind !== "student") return { ok: false, error: { message: "This step is for student accounts." } };
  if (p.data.guardianEmail === me.email) return { ok: false, error: { message: "Use your parent or guardian's own email — not yours." } };
  const { messageViolation } = await import("@/lib/moderation");
  if (messageViolation(p.data.firstName) || messageViolation(p.data.guardianName)) return { ok: false, error: { message: "Please use real names." } };

  const a = await supabase.from("profiles").update({ full_name: p.data.firstName }).eq("id", uid);
  if (a.error) return { ok: false, error: toActionError(a.error) };
  const t = await supabase.rpc("accept_terms", { p_kind: "terms" });
  if (t.error) return { ok: false, error: toActionError(t.error) };

  const row = { first_name: p.data.firstName, grade: p.data.grade, county: p.data.county || null };
  const { data: existing } = await supabase.from("students").select("id").eq("family_id", uid).maybeSingle();
  let id = existing?.id;
  if (id) {
    const { error } = await supabase.from("students").update(row).eq("id", id);
    if (error) return { ok: false, error: toActionError(error) };
  } else {
    const { data, error } = await supabase.from("students").insert({ ...row, family_id: uid }).select("id").single();
    if (error) return { ok: false, error: toActionError(error) };
    id = data.id;
  }

  // Only (re)send the parent email when it's new or changed.
  const { data: g } = await supabase.from("guardians").select("name, email").eq("account_id", uid).maybeSingle();
  let invited = false;
  if (!g || g.email !== p.data.guardianEmail || g.name !== p.data.guardianName) {
    const r = await supabase.rpc("student_set_guardian", { p_name: p.data.guardianName, p_email: p.data.guardianEmail });
    if (r.error) return { ok: false, error: toActionError(r.error) };
    invited = true;
    kickEmails();
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { id: id!, invited } };
}

/** "Resend" / "change parent email" from the student dashboard. */
export async function resendGuardianInvite(input: { name: string; email: string }): Promise<ActionState> {
  const p = z
    .object({ name: z.string().trim().min(2, "Enter your parent or guardian's name.").max(120), email: z.string().trim().toLowerCase().email("Enter a valid email.") })
    .safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase } = await session();
  const { error } = await supabase.rpc("student_set_guardian", { p_name: p.data.name, p_email: p.data.email });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Sent! Ask ${p.data.name.split(" ")[0]} to check their email (and spam folder).` };
}

export async function finishStudentOnboarding(): Promise<ActionState> {
  const { supabase } = await session();
  const done = await supabase.rpc("complete_onboarding");
  if (done.error) return { ok: false, error: toActionError(done.error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const studentBasics = z.object({
  id: z.string().uuid().nullable().optional(),
  firstName: z
    .string()
    .trim()
    .min(1, "Please enter your student's first name.")
    .max(40)
    .refine((s) => !/\s\S+\s\S+/.test(s), "First name only, please."),
  grade: z.coerce.number().int().min(6, "Middle school only (grades 6–8).").max(8, "Middle school only (grades 6–8)."),
  county,
  school: z.string().trim().max(120).optional(),
});

export async function saveStudentBasics(input: z.input<typeof studentBasics>): Promise<ActionState<{ id: string }>> {
  const p = studentBasics.safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  const row = { first_name: p.data.firstName, grade: p.data.grade, county: p.data.county || null, school: p.data.school || null };
  if (p.data.id) {
    const { error } = await supabase.from("students").update(row).eq("id", p.data.id).eq("family_id", uid);
    if (error) return { ok: false, error: toActionError(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: { id: p.data.id } };
  }
  const { count } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("family_id", uid);
  if ((count ?? 0) >= 6) return { ok: false, error: { message: "A family account can have up to 6 students." } };
  const { data, error } = await supabase.from("students").insert({ ...row, family_id: uid }).select("id").single();
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { id: data.id } };
}

const studentInstruments = z.object({
  studentId: z.string().uuid(),
  items: z
    .array(
      z.object({
        subjectId: z.string().uuid().nullable(),
        name: z.string().trim().min(2).max(40),
        family: z.string().optional(),
        level,
        yearsPlaying: z.coerce.number().int().min(0).max(10),
        hasInstrument: z.literal(true, { message: "Lessons need an instrument to practice on at home." }),
        inSchoolProgram: z.boolean(),
      }),
    )
    .min(1, "Add at least one instrument.")
    .max(3, "Up to 3 instruments."),
});

export async function saveStudentInstruments(input: z.input<typeof studentInstruments>): Promise<ActionState> {
  const p = studentInstruments.safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  const { data: student } = await supabase.from("students").select("id").eq("id", p.data.studentId).eq("family_id", uid).maybeSingle();
  if (!student) return { ok: false, error: { message: "Student not found." } };

  const rows = [];
  for (const item of p.data.items) {
    const r = await resolveSubjectId(supabase, item);
    if ("error" in r) return { ok: false, error: r.error! };
    rows.push({
      student_id: student.id,
      subject_id: r.id,
      level: item.level,
      years_playing: item.yearsPlaying,
      has_instrument: true,
      in_school_program: item.inSchoolProgram,
    });
  }
  const unique = [...new Map(rows.map((r) => [r.subject_id, r])).values()];
  const up = await supabase.from("student_subjects").upsert(unique, { onConflict: "student_id,subject_id" });
  if (up.error) return { ok: false, error: toActionError(up.error) };
  const keep = unique.map((r) => r.subject_id);
  const del = await supabase.from("student_subjects").delete().eq("student_id", student.id).not("subject_id", "in", `(${keep.join(",")})`);
  if (del.error) return { ok: false, error: toActionError(del.error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const studentPrefs = z.object({
  studentId: z.string().uuid(),
  goals: z.array(z.enum(goalKeys)).max(3, "Pick up to 3 goals."),
  learningStyle: style,
  explainStyle: explain,
  preferredMinutes: z.coerce.number().refine((n) => [30, 45, 60].includes(n)),
  notes: z.string().trim().max(500).optional(),
  interests,
});

export async function saveStudentPreferences(input: z.input<typeof studentPrefs>): Promise<ActionState> {
  const p = studentPrefs.safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  const { error } = await supabase
    .from("students")
    .update({
      goals: p.data.goals,
      learning_style: p.data.learningStyle,
      explain_style: p.data.explainStyle,
      preferred_minutes: p.data.preferredMinutes,
      ...(p.data.notes !== undefined ? { notes: p.data.notes || null } : {}),
      ...(p.data.interests ? { interests: p.data.interests } : {}),
    })
    .eq("id", p.data.studentId)
    .eq("family_id", uid);
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function saveStudentAvailability(input: { studentId: string; slots: string[] }): Promise<ActionState> {
  const p = z.object({ studentId: z.string().uuid(), slots: slots.min(1, "Pick at least one time block.") }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  const { error } = await supabase.from("students").update({ availability: p.data.slots }).eq("id", p.data.studentId).eq("family_id", uid);
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const consent = z.object({
  studentId: z.string().uuid(),
  guardianName: z.string().trim().min(2, "Enter your full name.").max(120),
  relationship: z.string().trim().min(2, "Enter your relationship to the student.").max(40),
  phone,
  signature: z.string().trim().min(2, "Type your full name to sign.").max(120),
  acks: z.object({
    onlineOnly: z.literal(true),
    noRecording: z.literal(true),
    reachable: z.literal(true),
    incidentProcess: z.literal(true),
    freeNoPayment: z.literal(true),
    messagingMonitoring: z.literal(true),
  }, { message: "Please check every box to give consent." }),
  userAgent: z.string().max(400).optional(),
  finishOnboarding: z.boolean().optional(),
});

export async function signConsent(input: z.input<typeof consent>): Promise<ActionState> {
  const p = consent.safeParse(input);
  if (!p.success) {
    const onAcks = p.error.issues.some((i) => i.path[0] === "acks");
    return { ok: false, error: { message: onAcks ? "Please check every box to give consent." : p.error.issues[0].message } };
  }
  if (p.data.signature.toLowerCase() !== p.data.guardianName.toLowerCase())
    return { ok: false, error: { message: "Your signature must match your full name exactly." } };
  const { supabase } = await session();
  const { error } = await supabase.rpc("sign_consent", {
    p_student: p.data.studentId,
    p_guardian_name: p.data.guardianName,
    p_relationship: p.data.relationship,
    p_phone: p.data.phone,
    p_signature: p.data.signature,
    p_online_only: true,
    p_no_recording: true,
    p_reachable: true,
    p_incident_process: true,
    p_free_no_payment: true,
    p_messaging_monitoring: true,
    p_user_agent: p.data.userAgent ?? undefined,
  });
  if (error) return { ok: false, error: toActionError(error) };
  if (p.data.finishOnboarding) {
    const done = await supabase.rpc("complete_onboarding");
    if (done.error) return { ok: false, error: toActionError(done.error) };
  }
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function revokeConsent(studentId: string): Promise<ActionState> {
  if (!z.string().uuid().safeParse(studentId).success) return { ok: false, error: { message: "Student not found." } };
  const { supabase } = await session();
  const { error } = await supabase.rpc("revoke_consent", { p_student: studentId });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Consent withdrawn. Upcoming lessons were cancelled." };
}

// ---------------------------------------------------------------------------
// Tutor
// ---------------------------------------------------------------------------
const tutorAbout = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Please enter your first and last name.")
    .max(120)
    .refine((s) => s.includes(" "), "Please enter your first and last name."),
  grade: z.coerce.number().int().min(9, "Tutors are in grades 9–12.").max(12, "Tutors are in grades 9–12."),
  school: z.string().trim().min(2, "Enter your school.").max(120),
  county,
  bio: z.string().trim().max(600).optional(),
  acceptTerms: z.literal(true, { message: "Please agree to the Terms and Privacy Policy." }).optional(),
});

export async function saveTutorAbout(input: z.input<typeof tutorAbout>): Promise<ActionState> {
  const p = tutorAbout.safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  if (p.data.bio) {
    const { messageViolation } = await import("@/lib/moderation");
    const v = messageViolation(p.data.bio);
    if (v) return { ok: false, error: { message: `Your bio can't include ${v}.` } };
  }
  const a = await supabase.from("profiles").update({ full_name: p.data.fullName }).eq("id", uid);
  if (a.error) return { ok: false, error: toActionError(a.error) };
  const b = await supabase
    .from("tutor_profiles")
    .update({ grade: p.data.grade, school: p.data.school, county: p.data.county || null, bio: p.data.bio || null })
    .eq("user_id", uid);
  if (b.error) return { ok: false, error: toActionError(b.error) };
  if (p.data.acceptTerms) {
    const t = await supabase.rpc("accept_terms", { p_kind: "terms" });
    if (t.error) return { ok: false, error: toActionError(t.error) };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const tutorInstruments = z.object({
  items: z
    .array(
      z.object({
        subjectId: z.string().uuid().nullable(),
        name: z.string().trim().min(2).max(40),
        family: z.string().optional(),
        ownLevel: z.enum(["intermediate", "advanced"]),
        yearsPlaying: z.coerce.number().int().min(1, "You need at least a year of experience to tutor.").max(15),
        topEnsemble: z.enum(["school", "top_school", "all_district", "all_state", "youth_orchestra"]),
        teachLevels: z.array(level).min(1, "Pick at least one level you'd like to teach."),
      }),
    )
    .min(1, "Add at least one instrument you play.")
    .max(4, "Up to 4 instruments."),
});

export async function saveTutorInstruments(input: z.input<typeof tutorInstruments>): Promise<ActionState> {
  const p = tutorInstruments.safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  const rows = [];
  for (const item of p.data.items) {
    const teach = item.teachLevels.filter((l) => LEVELS.indexOf(l) <= LEVELS.indexOf(item.ownLevel));
    if (!teach.length) return { ok: false, error: { message: `Pick a level you can teach for ${item.name}.` } };
    const r = await resolveSubjectId(supabase, item);
    if ("error" in r) return { ok: false, error: r.error! };
    rows.push({
      tutor_id: uid,
      subject_id: r.id,
      own_level: item.ownLevel,
      years_playing: item.yearsPlaying,
      top_ensemble: item.topEnsemble,
      teach_levels: teach,
    });
  }
  const unique = [...new Map(rows.map((r) => [r.subject_id, r])).values()];
  const up = await supabase.from("tutor_subjects").upsert(unique, { onConflict: "tutor_id,subject_id" });
  if (up.error) return { ok: false, error: toActionError(up.error) };
  const del = await supabase
    .from("tutor_subjects")
    .delete()
    .eq("tutor_id", uid)
    .not("subject_id", "in", `(${unique.map((r) => r.subject_id).join(",")})`);
  if (del.error) return { ok: false, error: toActionError(del.error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const tutorTeaching = z.object({
  strengths: z.array(z.enum(goalKeys)).min(1, "Pick at least one thing you're good at teaching.").max(4, "Pick up to 4."),
  teachingStyle: style,
  explainStyle: explain,
  maxStudents: z.coerce.number().int().min(1).max(8),
  sessionMinutes: z.array(z.coerce.number().refine((n) => [30, 45, 60].includes(n))).min(1, "Offer at least one lesson length."),
  acceptingStudents: z.boolean().optional(),
  interests,
});

export async function saveTutorTeaching(input: z.input<typeof tutorTeaching>): Promise<ActionState> {
  const p = tutorTeaching.safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  const { error } = await supabase
    .from("tutor_profiles")
    .update({
      teaching_strengths: p.data.strengths,
      teaching_style: p.data.teachingStyle,
      explain_style: p.data.explainStyle,
      max_students: p.data.maxStudents,
      session_minutes: [...new Set(p.data.sessionMinutes)].sort((a, b) => a - b),
      ...(p.data.acceptingStudents === undefined ? {} : { accepting_students: p.data.acceptingStudents }),
      ...(p.data.interests ? { interests: p.data.interests } : {}),
    })
    .eq("user_id", uid);
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function saveTutorAvailability(input: { slots: string[] }): Promise<ActionState> {
  const p = z.object({ slots: slots.min(1, "Pick at least one time block.") }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase, uid } = await session();
  const { error } = await supabase.from("tutor_profiles").update({ availability: p.data.slots }).eq("user_id", uid);
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function saveMeetLink(input: { url: string }): Promise<ActionState<{ url: string }>> {
  const url = normalizeMeetUrl(input.url);
  if (!url) return { ok: false, error: { message: "That doesn’t look like a Google Meet link. It should look like meet.google.com/abc-defg-hij." } };
  const { supabase, uid } = await session();
  const { error } = await supabase.from("tutor_profiles").update({ meet_url: url }).eq("user_id", uid);
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { url } };
}

const agreement = z.object({
  signature: z.string().trim().min(3, "Type your full name to sign."),
  guardianName: z.string().trim().min(2, "Enter your parent or guardian's name.").max(120),
  guardianEmail: z.string().trim().toLowerCase().email("Enter your parent or guardian's email."),
  guardianPhone: z.union([phone, z.literal("")]).optional(),
  acks: z.array(z.literal(true)).length(4, "Please check every box."),
});

export async function signTutorAgreement(input: z.input<typeof agreement>): Promise<ActionState<{ status: string }>> {
  const p = agreement.safeParse(input);
  if (!p.success) return invalid(p.error);
  const { supabase } = await session();
  const s = await supabase.rpc("sign_tutor_agreement", {
    p_signature: p.data.signature,
    p_guardian_name: p.data.guardianName,
    p_guardian_email: p.data.guardianEmail,
    p_guardian_phone: p.data.guardianPhone || "",
  });
  if (s.error) return { ok: false, error: toActionError(s.error) };
  const done = await supabase.rpc("complete_onboarding");
  if (done.error) return { ok: false, error: toActionError(done.error) };
  kickEmails();
  // No revalidatePath here: revalidating re-renders /onboarding, which now sees an onboarded
  // tutor and redirects to /dashboard before the wizard can show its "you're set up" screen.
  // The dashboard hasn't been visited during onboarding, so it loads fresh anyway.
  return { ok: true, data: { status: String((done.data as { status?: string } | null)?.status ?? "pending") } };
}

/** Tutor dashboard: email the parent/guardian approval link again. */
export async function resendTutorGuardianRequest(): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resend_tutor_guardian_request");
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  return { ok: true, message: "Sent! Ask your parent to check their email (and spam folder)." };
}

const tutorGuardian = z.object({
  name: z.string().trim().min(2, "Enter your parent or guardian's name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter your parent or guardian's email."),
});

/** Tutor dashboard: fix or change the parent/guardian who approves. A new email resets approval. */
export async function updateTutorGuardian(input: z.input<typeof tutorGuardian>): Promise<ActionState> {
  const p = tutorGuardian.safeParse(input);
  if (!p.success) return { ok: false, error: { message: p.error.issues[0].message } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("tutor_update_guardian", { p_name: p.data.name, p_email: p.data.email });
  if (error) return { ok: false, error: toActionError(error) };
  kickEmails();
  revalidatePath("/dashboard");
  return { ok: true, message: `Sent to ${p.data.email}.` };
}
