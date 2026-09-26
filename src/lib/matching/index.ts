/**
 * Teach for a Cause — tutor matching.
 *
 * Principles (from the program spec):
 *  1. Instrument first. A tutor must actually play the instrument (or, as a
 *     clearly-labelled fallback, a closely related one).
 *  2. Route by compatibility, not seniority. The most advanced tutor is NOT
 *     automatically the best match — a beginner is best served by a tutor who
 *     wants to teach beginners. Playing level beyond the student's is never
 *     rewarded on its own.
 *  3. Every student who signs up should be matchable. Instead of filtering
 *     tutors out, we sort them into tiers so a family always sees their best
 *     available options and an honest reason for anything less than ideal.
 *  4. Spread the load. Tutors with more open capacity rank higher among
 *     otherwise-equal options, so the same few tutors don't absorb every
 *     request. Remaining ties are broken by a stable per-student hash.
 *  5. Missing answers are neutral. A signal the student didn't answer (e.g.
 *     interests) is left out and its weight is spread over the others, so an
 *     incomplete profile is never punished or rewarded.
 *  6. Both directions agree. Tutors browsing students see exactly the same
 *     score the student sees for them (rankStudentsForTutor reuses scoreOne).
 *
 * The function is pure and deterministic: same inputs → same output,
 * regardless of the order candidates are passed in.
 */
import { LEVELS, type Level, slotLabel, goalLabel, interestLabel } from "../constants";

export type Tier = "ideal" | "stretch" | "related" | "full";

export interface StudentSubject {
  subjectId: string;
  slug: string;
  name: string;
  family: string;
  level: Level;
}

export interface StudentProfile {
  id: string;
  firstName: string;
  goals: string[];
  learningStyle: string | null;
  explainStyle: string | null;
  availability: string[];
  preferredMinutes: number;
  subjects: StudentSubject[];
  interests?: string[];
  county?: string | null;
  /** Tutors this student already has an active lesson relationship with. */
  currentTutorIds?: string[];
}

export interface TutorSubject {
  subjectId: string;
  slug: string;
  name: string;
  family: string;
  ownLevel: Level;
  yearsPlaying: number;
  topEnsemble: string;
  teachLevels: Level[];
}

export interface TutorCandidate {
  tutorId: string;
  displayName: string;
  availability: string[];
  teachingStrengths: string[];
  teachingStyle: string | null;
  explainStyle: string | null;
  sessionMinutes: number[];
  maxStudents: number;
  activeStudents: number;
  acceptingStudents: boolean;
  subjects: TutorSubject[];
  interests?: string[];
  county?: string | null;
  /** Lessons the tutor cancelled with < 24h notice in the last 90 days. */
  lateCancels?: number;
}

export interface ScoreBreakdown {
  level: number;
  availability: number;
  goals: number;
  interests: number;
  style: number;
  capacity: number;
  adjustments: number;
}

export interface MatchResult {
  tutorId: string;
  tier: Tier;
  score: number; // 0–100, rounded
  canRequest: boolean;
  subject: TutorSubject; // the instrument this match is based on
  sharedSlots: string[];
  sharedGoals: string[];
  sharedInterests: string[];
  reasons: string[];
  cautions: string[];
  breakdown: ScoreBreakdown;
}

export const WEIGHTS = { level: 30, availability: 25, goals: 15, interests: 10, style: 10, capacity: 10 } as const;
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
export const TIER_ORDER: Record<Tier, number> = { ideal: 0, stretch: 1, related: 2, full: 3 };
const TIER_MULTIPLIER: Record<Tier, number> = { ideal: 1, stretch: 0.8, related: 0.75, full: 1 };

/** Instruments close enough that a player of one can genuinely help a player of the other. */
export const RELATED_GROUPS: string[][] = [
  ["flute", "piccolo"],
  ["oboe", "english-horn"],
  ["clarinet", "bass-clarinet", "alto-saxophone", "tenor-saxophone", "baritone-saxophone", "soprano-saxophone"],
  ["trombone", "bass-trombone", "euphonium", "tuba"],
  ["percussion", "mallets", "timpani", "drum-set"],
  ["violin", "viola"],
  ["cello", "double-bass"],
  ["guitar", "bass-guitar"],
];

export function areRelated(slugA: string, slugB: string): boolean {
  if (slugA === slugB) return false;
  return RELATED_GROUPS.some((g) => g.includes(slugA) && g.includes(slugB));
}

const levelIndex = (l: Level) => LEVELS.indexOf(l);

/**
 * How well a tutor's chosen teaching range fits the student's level (0..1).
 * Tutors who focus on the student's level score highest; tutors who teach
 * every level still score well; there's no bonus for playing far above.
 */
export function levelFit(studentLevel: Level, teachLevels: Level[]): number {
  if (!teachLevels.includes(studentLevel)) return 0;
  const idx = teachLevels.map(levelIndex);
  const center = (Math.min(...idx) + Math.max(...idx)) / 2;
  const distance = Math.abs(levelIndex(studentLevel) - center); // 0..1.5 when included
  return 1 - distance / 3; // 0.5..1
}

function styleFit(a: string | null, b: string | null): number {
  if (!a || !b) return 0.6;
  if (a === b) return 1;
  if (a === "balanced" || b === "balanced") return 0.7;
  return 0.2;
}

/** Stable 32-bit FNV-1a hash → [0,1). Used only to break exact ties fairly. */
export function tieBreak(studentId: string, tutorId: string): number {
  let h = 0x811c9dc5;
  const s = `${studentId}:${tutorId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

function listSlots(slots: string[], max = 3): string {
  const labels = slots.slice(0, max).map(slotLabel);
  const extra = slots.length - labels.length;
  return extra > 0 ? `${labels.join(", ")} +${extra} more` : labels.join(", ");
}

function scoreOne(
  student: StudentProfile,
  target: StudentSubject,
  tutor: TutorCandidate,
  subject: TutorSubject,
  tier: Tier,
): MatchResult {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const isCurrent = student.currentTutorIds?.includes(tutor.tutorId) ?? false;

  // Level
  const fit = levelFit(target.level, subject.teachLevels);
  const level =
    tier === "stretch" || (tier === "full" && fit === 0)
      ? WEIGHTS.level * 0.35
      : tier === "related"
        ? WEIGHTS.level * Math.max(fit, 0.35)
        : WEIGHTS.level * fit;
  if (tier === "related") {
    reasons.push(`Plays ${subject.name}, closely related to ${target.name}`);
  } else if (fit > 0) {
    reasons.push(
      subject.teachLevels.length === 1
        ? `Focuses on ${target.level} ${target.name.toLowerCase()} students`
        : `Teaches ${target.level} ${target.name.toLowerCase()}`,
    );
  } else {
    cautions.push(`Usually teaches ${subject.teachLevels.join(", ")} students`);
  }

  // Availability
  const tutorSlots = new Set(tutor.availability);
  const sharedSlots = student.availability.filter((s) => tutorSlots.has(s));
  let availability: number;
  if (student.availability.length === 0) {
    availability = WEIGHTS.availability * 0.5;
    cautions.push("Add your availability to see time overlap");
  } else if (sharedSlots.length === 0) {
    availability = 0;
    cautions.push("No shared times yet — you can still propose one");
  } else {
    availability = WEIGHTS.availability * Math.min(sharedSlots.length, 3) / 3;
    reasons.push(`Free when you are: ${listSlots(sharedSlots)}`);
  }

  // Goals
  const strengths = new Set(tutor.teachingStrengths);
  const sharedGoals = student.goals.filter((g) => strengths.has(g));
  const goals =
    student.goals.length === 0
      ? WEIGHTS.goals * 0.5
      : (WEIGHTS.goals * sharedGoals.length) / student.goals.length;
  if (sharedGoals.length > 0) reasons.push(`Helps with ${sharedGoals.map((g) => goalLabel(g).toLowerCase()).join(" & ")}`);

  // Style
  const teach = styleFit(student.learningStyle, tutor.teachingStyle);
  const explain = styleFit(student.explainStyle, tutor.explainStyle);
  const style = (WEIGHTS.style / 2) * teach + (WEIGHTS.style / 2) * explain;
  if (teach === 1 && explain === 1) reasons.push("Teaching style matches how you like to learn");

  // Interests (music the student enjoys). Left out entirely when the student gave none.
  const studentInterests = student.interests ?? [];
  const tutorInterests = new Set(tutor.interests ?? []);
  const sharedInterests = studentInterests.filter((i) => tutorInterests.has(i));
  const interestsApply = studentInterests.length > 0;
  const interests = interestsApply
    ? WEIGHTS.interests * Math.min(1, sharedInterests.length / Math.min(2, studentInterests.length))
    : 0;
  if (sharedInterests.length > 0) reasons.push(`Also into ${sharedInterests.slice(0, 2).map((i) => interestLabel(i).toLowerCase()).join(" & ")}`);

  // Capacity (load balancing)
  const max = Math.max(1, tutor.maxStudents);
  const open = Math.max(0, max - tutor.activeStudents);
  const capacity = isCurrent ? WEIGHTS.capacity : (WEIGHTS.capacity * open) / max;
  if (isCurrent) reasons.unshift(`Already working with ${student.firstName}`);
  else if (tier !== "full" && open > 0 && open === max) reasons.push("Has open spots for new students");

  // Adjustments
  let adjustments = 0;
  if (!tutor.sessionMinutes.includes(student.preferredMinutes)) {
    adjustments -= 3;
    cautions.push(`Offers ${tutor.sessionMinutes.join("/")}-minute lessons`);
  }
  if (student.county && tutor.county && student.county === tutor.county) {
    adjustments += 2;
    reasons.push(`Also from ${tutor.county} County`);
  }
  // Reliability: repeated late cancellations cost a little. Never shown to families (tutors are minors too).
  const late = Math.max(0, tutor.lateCancels ?? 0);
  if (late >= 2) adjustments -= Math.min(6, 2 * (late - 1));

  // Signals the student didn't answer are dropped and the rest are scaled to 100.
  const applicable = TOTAL_WEIGHT - (interestsApply ? 0 : WEIGHTS.interests);
  const base = ((level + availability + goals + interests + style + capacity) * TOTAL_WEIGHT) / applicable;
  const raw = (base + adjustments) * TIER_MULTIPLIER[tier];
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  if (tier === "full") {
    cautions.unshift(tutor.acceptingStudents ? "Schedule is full right now" : "Not taking new students right now");
  }

  return {
    tutorId: tutor.tutorId,
    tier,
    score,
    canRequest: tier !== "full",
    subject,
    sharedSlots,
    sharedGoals,
    sharedInterests,
    reasons,
    cautions,
    breakdown: {
      level: round1(level),
      availability: round1(availability),
      goals: round1(goals),
      interests: round1(interests),
      style: round1(style),
      capacity: round1(capacity),
      adjustments,
    },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Ranks tutors for one of the student's instruments.
 *
 * Tiers (in order):
 *  - ideal:   plays the exact instrument, teaches the student's level, has room.
 *  - stretch: plays the exact instrument and has room, but hasn't listed this level.
 *  - related: plays a closely related instrument at the student's level, has room.
 *             Only included when no ideal match exists, so families see it as a fallback.
 *  - full:    plays the exact instrument but has no room right now (shown, not requestable).
 *
 * Tutors with no connection to the instrument are never returned.
 */
export function matchTutors(
  student: StudentProfile,
  targetSubjectId: string,
  candidates: TutorCandidate[],
  options: { includeRelated?: "auto" | "always" | "never" } = {},
): MatchResult[] {
  const target = student.subjects.find((s) => s.subjectId === targetSubjectId);
  if (!target) return [];
  const includeRelated = options.includeRelated ?? "auto";

  const seen = new Set<string>();
  const exact: MatchResult[] = [];
  const related: MatchResult[] = [];

  for (const tutor of candidates) {
    if (seen.has(tutor.tutorId)) continue;
    seen.add(tutor.tutorId);

    const isCurrent = student.currentTutorIds?.includes(tutor.tutorId) ?? false;
    const hasRoom = isCurrent || (tutor.acceptingStudents && tutor.activeStudents < tutor.maxStudents);
    const exactSubject = tutor.subjects.find((s) => s.subjectId === targetSubjectId);

    if (exactSubject) {
      const teachesLevel = exactSubject.teachLevels.includes(target.level);
      const tier: Tier = !hasRoom ? "full" : teachesLevel ? "ideal" : "stretch";
      exact.push(scoreOne(student, target, tutor, exactSubject, tier));
      continue;
    }

    if (includeRelated === "never" || !hasRoom) continue;
    const relatedSubjects = tutor.subjects
      .filter((s) => areRelated(s.slug, target.slug) && s.teachLevels.includes(target.level))
      .map((s) => scoreOne(student, target, tutor, s, "related"))
      .sort((a, b) => b.score - a.score || a.subject.slug.localeCompare(b.subject.slug));
    if (relatedSubjects.length > 0) related.push(relatedSubjects[0]);
  }

  const hasIdeal = exact.some((m) => m.tier === "ideal");
  const results = includeRelated === "always" || (includeRelated === "auto" && !hasIdeal) ? [...exact, ...related] : exact;

  return results.sort(
    (a, b) =>
      TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
      b.score - a.score ||
      tieBreak(student.id, b.tutorId) - tieBreak(student.id, a.tutorId) ||
      a.tutorId.localeCompare(b.tutorId),
  );
}

/** Convenience: the best requestable match per instrument the student plays. */
export function bestMatchesByInstrument(student: StudentProfile, candidates: TutorCandidate[]) {
  return student.subjects.map((s) => ({
    subject: s,
    matches: matchTutors(student, s.subjectId, candidates),
  }));
}

export const TIER_LABEL: Record<Tier, string> = {
  ideal: "Great match",
  stretch: "Possible match",
  related: "Related instrument",
  full: "Currently full",
};

export interface StudentMatch {
  studentId: string;
  match: MatchResult;
  subject: StudentSubject;
}

/**
 * The tutor's view: which students fit this tutor best. For every student we
 * score each instrument the tutor can help with (exactly or as a related
 * instrument) with the SAME scorer families see, keep the best, and rank.
 * Capacity is scored as the student would see it, but a tutor's own full
 * schedule never hides students from them — the database refuses the offer.
 * Students the tutor can't help with at all are omitted.
 */
export function rankStudentsForTutor(tutor: TutorCandidate, students: StudentProfile[]): StudentMatch[] {
  const open: TutorCandidate = { ...tutor, acceptingStudents: true, activeStudents: Math.min(tutor.activeStudents, Math.max(0, tutor.maxStudents - 1)) };
  const seen = new Set<string>();
  const out: StudentMatch[] = [];
  for (const s of students) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    let best: StudentMatch | null = null;
    for (const subj of s.subjects) {
      const [m] = matchTutors(s, subj.subjectId, [open], { includeRelated: "always" });
      if (!m) continue;
      if (!best || TIER_ORDER[m.tier] < TIER_ORDER[best.match.tier] || (m.tier === best.match.tier && m.score > best.match.score)) {
        best = { studentId: s.id, match: m, subject: subj };
      }
    }
    if (best) out.push(best);
  }
  return out.sort(
    (a, b) =>
      TIER_ORDER[a.match.tier] - TIER_ORDER[b.match.tier] ||
      b.match.score - a.match.score ||
      tieBreak(tutor.tutorId, b.studentId) - tieBreak(tutor.tutorId, a.studentId) ||
      a.studentId.localeCompare(b.studentId),
  );
}
