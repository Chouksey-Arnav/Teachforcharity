import { SESSION_STATUS_LABEL } from "./constants";

export type LessonTone = "neutral" | "pine" | "brass" | "clay" | "sky";

export interface LessonLike {
  status: string;
  my_side: "family" | "tutor";
  awaiting_me: boolean;
  end_at: string;
  tutor_name: string;
  student_name: string;
  family_attendance: "present" | "absent" | null;
}

/**
 * The badge on a lesson, in words a 12-year-old gets at a glance. Families see
 * five states (waiting, your turn, booked, did they show up, done); the
 * partner-certification steps behind "done" only matter to the tutor, who
 * keeps the detailed hour states.
 */
export function lessonBadge(s: LessonLike, now: number = Date.now()): { label: string; tone: LessonTone } {
  const tutorFirst = s.tutor_name.split(" ")[0];
  if (s.status === "pending") {
    return s.awaiting_me ? { label: "Your turn", tone: "brass" } : { label: `Waiting for ${s.my_side === "family" ? tutorFirst : s.student_name}`, tone: "brass" };
  }
  if (s.my_side === "tutor") {
    return { label: SESSION_STATUS_LABEL[s.status] ?? s.status, tone: TUTOR_TONES[s.status] ?? "neutral" };
  }
  const ended = Date.parse(s.end_at) <= now;
  const recent = now - Date.parse(s.end_at) < 30 * 86400000;
  switch (s.status) {
    case "scheduled":
      return ended && !s.family_attendance && recent ? { label: `Did ${tutorFirst} show up?`, tone: "brass" } : { label: "Booked", tone: "pine" };
    case "completed":
      return !s.family_attendance && recent ? { label: `Did ${tutorFirst} show up?`, tone: "brass" } : { label: "Done", tone: "pine" };
    case "confirmed":
    case "verified":
    case "rejected":
      return { label: "Done", tone: "pine" };
    case "disputed":
      return { label: `You said ${tutorFirst} wasn’t there`, tone: "clay" };
    case "declined":
      return { label: "Not booked", tone: "neutral" };
    case "expired":
      return { label: "Ran out of time", tone: "neutral" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: SESSION_STATUS_LABEL[s.status] ?? s.status, tone: "neutral" };
  }
}

const TUTOR_TONES: Record<string, LessonTone> = {
  scheduled: "pine",
  completed: "sky",
  confirmed: "sky",
  verified: "pine",
  disputed: "clay",
  rejected: "clay",
};
