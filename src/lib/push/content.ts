/**
 * What a phone shows for an email we just sent, or null for emails that
 * shouldn't also buzz a phone. Notifications show on lock screens, so they
 * carry no message text, links to video calls, or anything beyond the email's
 * subject line.
 */
export interface PushContent {
  title: string;
  body: string;
  /** Same-origin path the notification opens. */
  url: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag: string;
}

type Payload = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : typeof v === "number" ? String(v) : "");
const uuid = /^[0-9a-f-]{36}$/;
const LESSONS_ACTION = "/dashboard/lessons?tab=action";
const lessonUrl = (p: Payload, tab = "upcoming") => (uuid.test(s(p.session_id)) ? `/dashboard/lessons?focus=${s(p.session_id)}` : `/dashboard/lessons?tab=${tab}`);
const weekly = (p: Payload) => Number(p.weeks) > 1;

export function pushContent(template: string, p: Payload): PushContent | null {
  // Emails to a parent's own inbox about a student account (role "guardian") are not for this device's user.
  if (p.role === "guardian") return null;
  switch (template) {
    case "new_message":
      return {
        title: `New message from ${s(p.sender_name) || "your tutor"}`,
        body: s(p.student_name) ? `About ${s(p.student_name)}’s lessons. Tap to read.` : "Tap to read.",
        url: uuid.test(s(p.thread_id)) ? `/dashboard/messages/${s(p.thread_id)}` : "/dashboard/messages",
        tag: `thread:${s(p.thread_id)}`,
      };
    case "practice_assigned":
      return {
        title: `New practice from ${s(p.tutor_name) || "your tutor"}`,
        body: p.self ? "It’s on your Practice board." : `For ${s(p.student_name)}. It’s on the Practice board.`,
        url: "/dashboard/practice",
        tag: "practice",
      };
    case "session_requested":
      return {
        title: weekly(p) ? `Weekly ${s(p.subject)} lessons requested` : `${s(p.subject)} lesson requested`,
        body: `${s(p.student_name)} · ${weekly(p) ? s(p.weekly) : s(p.when)}. Tap to accept or suggest a time.`,
        url: LESSONS_ACTION,
        tag: `request:${s(p.session_id) || s(p.when)}`,
      };
    case "session_countered":
      return {
        title: "A new time was suggested",
        body: `${s(p.other_name)} suggested ${weekly(p) ? s(p.weekly) : s(p.when)} for ${s(p.subject)}.`,
        url: LESSONS_ACTION,
        tag: `request:${s(p.session_id) || s(p.when)}`,
      };
    case "session_booked":
      return {
        title: weekly(p) ? "Weekly lessons booked" : "Lesson booked",
        body: `${s(p.subject)} · ${weekly(p) ? s(p.weekly) : s(p.when)}`,
        url: lessonUrl(p),
        tag: `request:${s(p.session_id) || s(p.when)}`,
      };
    case "session_declined":
      return { title: "Lesson request declined", body: `${s(p.subject)} · ${s(p.when)}`, url: "/dashboard/lessons", tag: `request:${s(p.session_id) || s(p.when)}` };
    case "session_cancelled":
      return {
        title: Number(p.count) > 1 ? `${s(p.count)} lessons cancelled` : "Lesson cancelled",
        body: `${s(p.subject)} with ${s(p.other_name)} · ${s(p.when)}`,
        url: "/dashboard/lessons",
        tag: `lesson:${s(p.session_id) || s(p.when)}`,
      };
    case "session_reminder":
      return {
        title: `${s(p.subject)} lesson coming up`,
        body: `${s(p.when)}. The Join button appears 15 minutes before.`,
        url: lessonUrl(p),
        tag: `lesson:${s(p.session_id)}`,
      };
    case "session_confirm_request":
    case "confirm_reminder":
      return { title: `Did ${s(p.student_name)}’s lesson happen?`, body: "One tap to confirm, so the tutor’s hours count.", url: LESSONS_ACTION, tag: `confirm:${s(p.session_id)}` };
    case "log_reminder":
      return { title: `Log ${s(p.student_name)}’s lesson`, body: `${s(p.subject)} · ${s(p.when)}`, url: LESSONS_ACTION, tag: `log:${s(p.session_id) || s(p.when)}` };
    default:
      return null;
  }
}
