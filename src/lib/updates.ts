/**
 * What an update says and where tapping it goes. Pure, so the Updates page,
 * the bell and Home all word things the same way (and it's unit tested).
 *
 * Rules for the wording: one short sentence a 12-year-old or a busy parent
 * reads at a glance, the person's name first, and a button that says exactly
 * what happens next ("Read", "Answer", "See lesson").
 */

export type UpdateArea = "messages" | "lessons" | "practice" | "hours" | "account";
export type UpdateTone = "neutral" | "good" | "action" | "bad";
export type UpdateIcon = "message" | "calendar" | "check" | "x" | "clock" | "practice" | "hours" | "shield" | "bell" | "spark" | "hand";

export interface UpdateRow {
  id: number;
  kind: string;
  area: string;
  payload: unknown;
  count: number;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  preview?: string | null;
}

export interface Viewer {
  role: string;
  /** The account belongs to the student themselves (not a parent). */
  isStudent: boolean;
}

export interface UpdateView {
  title: string;
  detail: string;
  /** Same-origin path. */
  href: string;
  cta: string;
  icon: UpdateIcon;
  tone: UpdateTone;
  /** Avatar to show instead of the icon (a person sent it). */
  person?: { name: string; avatar: string | null };
}

/** An update ready to show: worded for the viewer, with how long ago it happened. */
export interface UpdateItem {
  id: number;
  unread: boolean;
  /** "2 hours ago". */
  when: string;
  updatedAt: string;
  area: string;
  view: UpdateView;
}

type P = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown) => (UUID.test(s(v)) ? s(v) : "");
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const weekly = (p: P) => n(p.weeks) > 1;
const lessonHref = (p: P) => (id(p.session_id) ? `/dashboard/lessons?focus=${id(p.session_id)}` : "/dashboard/lessons");
const ACTION = "/dashboard/lessons?tab=action";
const joinDot = (...parts: string[]) => parts.filter(Boolean).join(" · ");

export const AREA_LABEL: Record<UpdateArea, string> = {
  messages: "Messages",
  lessons: "Lessons",
  practice: "Practice",
  hours: "Hours",
  account: "Account",
};

export function isArea(v: unknown): v is UpdateArea {
  return typeof v === "string" && v in AREA_LABEL;
}

export function describeUpdate(row: UpdateRow, viewer: Viewer): UpdateView {
  const p: P = row.payload && typeof row.payload === "object" ? (row.payload as P) : {};
  const student = s(p.student_name) || "your student";
  const subject = s(p.subject) || "music";
  const when = weekly(p) ? s(p.weekly) || s(p.when) : s(p.when);
  const other = s(p.other_name);

  switch (row.kind) {
    case "message": {
      const sender = s(p.sender_name) || (viewer.role === "tutor" ? "A family" : "Your tutor");
      const k = Math.max(1, row.count);
      return {
        title: k > 1 ? `${sender} sent you ${k} messages` : `${sender} sent you a message`,
        detail: row.preview ? `“${row.preview}”` : `About ${viewer.isStudent && viewer.role !== "tutor" ? "your" : `${student}’s`} lessons`,
        href: id(p.thread_id) ? `/dashboard/messages/${id(p.thread_id)}` : "/dashboard/messages",
        cta: "Read",
        icon: "message",
        tone: "neutral",
        person: { name: sender, avatar: s(p.sender_avatar) || null },
      };
    }
    case "practice": {
      const tutor = s(p.tutor_name) || "Your tutor";
      const tasks = n(p.tasks);
      const what = [tasks ? plural(tasks, "task") : "", p.note ? "a note" : ""].filter(Boolean).join(" and ") || "practice notes";
      return {
        title: p.self ? `${tutor} gave you new practice` : `${tutor} gave ${student} new practice`,
        detail: `${what[0].toUpperCase()}${what.slice(1)} on the Practice board.`,
        href: "/dashboard/practice",
        cta: "See practice",
        icon: "practice",
        tone: "neutral",
        person: { name: tutor, avatar: s(p.tutor_avatar) || null },
      };
    }
    case "lesson_confirmed":
      return {
        title: `${p.self ? student : `${student}’s family`} confirmed you were there`,
        detail: joinDot(subject, s(p.when), "Your hours go to the partner for verifying"),
        href: "/dashboard/hours",
        cta: "See hours",
        icon: "check",
        tone: "good",
      };
    case "lesson_disputed":
      return {
        title: `${p.self ? student : `${student}’s family`} said you weren’t at the lesson`,
        detail: joinDot(subject, s(p.when), "It won’t count unless the program team clears it"),
        href: lessonHref(p),
        cta: "See lesson",
        icon: "x",
        tone: "bad",
      };

    // ---- Lessons (the same events that are emailed) ----
    case "session_proposed":
      return {
        title: viewer.isStudent
          ? `${s(p.tutor_name) || "A tutor"} wants to teach you ${weekly(p) ? "every week" : "a lesson"}`
          : `${s(p.tutor_name) || "A tutor"} proposed ${weekly(p) ? "weekly lessons" : "a lesson"} for ${student}`,
        detail: joinDot(subject, when, "Nothing is booked until you say yes"),
        href: ACTION,
        cta: "Answer",
        icon: "calendar",
        tone: "action",
      };
    case "session_requested":
      return {
        title: `${student} wants ${weekly(p) ? `weekly ${subject} lessons` : `a ${subject} lesson`}`,
        detail: joinDot(when, n(p.minutes) ? `${n(p.minutes)} min` : "", "Accept, suggest a time, or decline"),
        href: ACTION,
        cta: "Answer",
        icon: "calendar",
        tone: "action",
      };
    case "session_countered":
      return {
        title: `${other || "They"} suggested a different time`,
        detail: joinDot(subject, when),
        href: ACTION,
        cta: "Answer",
        icon: "calendar",
        tone: "action",
      };
    case "session_booked":
      return {
        title: weekly(p) ? `Booked: weekly ${subject} lessons` : `Booked: ${subject} lesson`,
        detail: joinDot(viewer.role === "tutor" ? `With ${student}` : other ? `With ${other}` : "", when),
        href: lessonHref(p),
        cta: "See lesson",
        icon: "check",
        tone: "good",
      };
    case "session_reminder":
      return {
        title: `${subject} lesson coming up`,
        detail: joinDot(when, "The Join button appears 15 minutes before"),
        href: lessonHref(p),
        cta: "See lesson",
        icon: "clock",
        tone: "action",
      };
    case "session_declined":
      return {
        title: `${other || "The tutor"} couldn’t take that time`,
        detail: joinDot(subject, when, s(p.reason) ? `“${s(p.reason)}”` : "Try another time or another tutor"),
        href: "/dashboard/tutors",
        cta: "Find a time",
        icon: "x",
        tone: "bad",
      };
    case "session_cancelled": {
      const many = n(p.count) > 1;
      return {
        title: many ? `${n(p.count)} lessons were cancelled` : "A lesson was cancelled",
        detail: joinDot(subject, when, other ? `By ${other}` : "", s(p.reason) ? `“${s(p.reason)}”` : ""),
        href: "/dashboard/lessons",
        cta: "See lessons",
        icon: "x",
        tone: "bad",
      };
    }
    case "session_confirm_request":
    case "confirm_reminder":
      return {
        title: viewer.isStudent ? `Was ${other || "your tutor"} at your lesson?` : `Did ${student}’s lesson happen?`,
        detail: "One tap. It’s how the tutor’s volunteer hours count.",
        href: ACTION,
        cta: "Answer",
        icon: "check",
        tone: "action",
      };
    case "log_reminder":
      return {
        title: `Log your lesson with ${student}`,
        detail: joinDot(subject, when, "Hours count after you log it"),
        href: ACTION,
        cta: "Log it",
        icon: "clock",
        tone: "action",
      };

    // ---- Hours ----
    case "hours_verified": {
      const hours = (n(p.minutes) / 60).toFixed(2).replace(/\.?0+$/, "") || "0";
      return {
        title: `${hours} volunteer ${Number(hours) === 1 ? "hour" : "hours"} verified`,
        detail: n(p.lessons) ? `Across ${plural(n(p.lessons), "lesson")}. They’re on your record.` : "They’re on your record.",
        href: "/dashboard/hours",
        cta: "See hours",
        icon: "hours",
        tone: "good",
      };
    }
    case "hours_rejected":
      return {
        title: "Some hours weren’t verified",
        detail: s(p.note) ? `Reviewer’s note: “${s(p.note)}”` : `${plural(n(p.lessons) || 1, "lesson")} couldn’t be verified.`,
        href: "/dashboard/hours",
        cta: "See hours",
        icon: "x",
        tone: "bad",
      };

    // ---- Account ----
    case "tutor_offer":
      return {
        title: `${s(p.tutor_name) || "A tutor"} wants to teach ${viewer.isStudent ? "you" : student}`,
        detail: joinDot(subject, s(p.note) ? `“${s(p.note)}”` : "Look at their profile and request a time"),
        href: id(p.thread_id) ? `/dashboard/messages/${id(p.thread_id)}` : "/dashboard",
        cta: "See offer",
        icon: "hand",
        tone: "action",
      };
    case "waitlist_match":
      return {
        title: `A ${subject} tutor just joined`,
        detail: `You asked us to tell you. Tutors fill up fast.`,
        href: id(p.student_id) ? `/dashboard/tutors?student=${id(p.student_id)}` : "/dashboard/tutors",
        cta: "See tutors",
        icon: "spark",
        tone: "action",
      };
    case "consent_receipt":
      return {
        title: `Consent signed for ${student}`,
        detail: "Lessons and messages are unlocked. Your copy was emailed to you.",
        href: "/dashboard/students",
        cta: "View",
        icon: "shield",
        tone: "good",
      };
    case "guardian_approved":
      return {
        title: "Your parent approved your account",
        detail: "You can message tutors and request lessons now.",
        href: "/dashboard/tutors",
        cta: "Find tutors",
        icon: "check",
        tone: "good",
      };
    case "tutor_guardian_approved":
      return {
        title: "Your parent approved you to volunteer",
        detail: "Next, a quick automatic check of your profile. We’ll tell you when families can see you.",
        href: "/dashboard",
        cta: "Open",
        icon: "check",
        tone: "good",
      };
    case "tutor_status_changed": {
      const st = s(p.status);
      const copy: Record<string, [string, string, UpdateTone]> = {
        active: p.first_approval
          ? ["You’re live as a tutor", "Families can find you and request lessons.", "good"]
          : ["Your tutor profile is active again", "Families can find you again.", "good"],
        paused: ["Your tutor profile is paused", "It’s hidden while the program team looks at something.", "bad"],
        removed: ["Your tutor profile was removed", "Contact the program team if this is a mistake.", "bad"],
      };
      const [title, detail, tone] = copy[st] ?? ["Your profile is waiting for review", "We’ll tell you as soon as it’s done.", "neutral" as UpdateTone];
      return { title, detail, href: "/dashboard", cta: "Open", icon: tone === "bad" ? "shield" : "check", tone };
    }
    case "incident_received":
      return {
        title: "We got your report",
        detail: "The program team will look at it. If anyone is in danger, call 911.",
        href: "/dashboard",
        cta: "Open",
        icon: "shield",
        tone: "neutral",
      };
    default:
      return { title: "Something changed on your account", detail: "", href: "/dashboard", cta: "Open", icon: "bell", tone: "neutral" };
  }
}

/** Only ever navigate to our own dashboard (the href is built from stored data). */
export function safeUpdateHref(href: string): string {
  return /^\/dashboard(?:[/?#]|$)/.test(href) && !href.startsWith("//") ? href : "/dashboard/updates";
}

/** "Today", "Yesterday", "Earlier this week", "Older" — in Eastern time, like the rest of the site. */
export function dayBucket(iso: string, now: Date = new Date()): "Today" | "Yesterday" | "Earlier this week" | "Older" {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const then = new Date(iso);
  if (day(then) === day(now)) return "Today";
  if (day(then) === day(new Date(now.getTime() - 86400000))) return "Yesterday";
  return now.getTime() - then.getTime() < 7 * 86400000 ? "Earlier this week" : "Older";
}
