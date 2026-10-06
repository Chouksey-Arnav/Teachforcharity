/**
 * Teach for a Cause — automated tutor account check (no AI, no external APIs).
 *
 * Replaces an admin approving every tutor by hand. Runs when a tutor signs up
 * or changes their profile, and again over every tutor account once a day.
 *
 *   identity    names are real-looking, the parent who approved isn't the tutor
 *               (same inbox, same name, or the tutor's name in the address)
 *   profile     bio, school and Meet link: safety lexicon, contact details,
 *               selling lessons, stated age, music relevance, gibberish
 *   messages    every message the tutor sent in the last 30 days, one by one
 *               (the safety scanner's per-message analysis, author-weighted)
 *               and per conversation (grooming, pressure, late-night patterns),
 *               plus students telling the tutor to stop or that it felt wrong
 *   conduct     open safety flags and reports involving the tutor
 *   attendance  how often students said the tutor wasn't there, and lessons
 *               logged without the tutor ever opening the lesson
 *
 * Each check passes, warns or fails, with points and a plain-English reason.
 * The decision:
 *   blocked   any "hard" fail (serious safety signal, faked parent approval).
 *             A live tutor is paused; nobody new goes live. Admins alerted.
 *   review    any other fail, or 35+ risk points. Nothing changes for a live
 *             tutor; a new one waits. Admins alerted to look at the exception.
 *   verified  everything else. A new tutor goes live on its own once their
 *             parent has approved.
 *
 * Pure and deterministic: same input, same output. The database applies the
 * decision (see supabase/migrations/*_automated_verification.sql).
 */
import { analyzeText, flagsForConversation, flagsForMessage, type ScanMessage, type Side } from "../safety/analyze";
import { normalize, tokenize } from "../safety/normalize";
import { messageViolation } from "../moderation";
import {
  COMMERCIAL,
  DISCOMFORT,
  MUSIC_TERMS,
  PLACEHOLDER_NAMES,
  SCHOOL_WORDS,
  STOPWORDS,
  canonicalEmail,
  looksLikeMash,
  nameKey,
  statedAges,
} from "./signals";

export const PIPELINE_VERSION = "tutor-check-1";

export type Stage = "identity" | "profile" | "messages" | "conduct" | "attendance";
export type Outcome = "pass" | "warn" | "fail";
export type Decision = "verified" | "review" | "blocked";

export interface Check {
  id: string;
  stage: Stage;
  outcome: Outcome;
  /** Risk points this check adds (0 when it passes). */
  points: number;
  /** A fail that blocks the account on its own. */
  hard?: boolean;
  /** For admins: why, in plain English. */
  detail: string;
  /** Short quotes that triggered it (admins only). */
  evidence?: string[];
  /** Something the tutor can fix themselves, shown on their dashboard. Never reveals safety rules. */
  tutorHint?: string;
}

export interface AccountMessage {
  id: string;
  threadId: string;
  senderSide: Side;
  body: string;
  createdAt: string;
}

export interface AccountInput {
  tutorId: string;
  status: "pending" | "active" | "paused" | "removed";
  fullName: string;
  email: string;
  grade: number | null;
  school: string | null;
  bio: string | null;
  meetUrl: string | null;
  guardianName: string | null;
  guardianEmail: string | null;
  /** The name the parent typed when approving (null until they approve). */
  guardianApprovedName: string | null;
  /** Every message in the tutor's conversations over the last 30 days, both sides. */
  messages: AccountMessage[];
  openFlags: { critical: number; high: number; medium: number };
  reports: { open: number; last90: number };
  attendance: {
    /** Lessons the tutor logged as happening, last 90 days. */
    logged: number;
    /** …of which the student said the tutor wasn't there. */
    studentSaidAbsent: number;
    /** …of which the tutor never opened the lesson from the site. */
    loggedWithoutJoining: number;
  };
}

export interface Verification {
  tutorId: string;
  decision: Decision;
  /** 0–100. */
  risk: number;
  checks: Check[];
  summary: string;
  tutorHints: string[];
  version: string;
}

const REVIEW_AT = 35;
const quote = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const pass = (id: string, stage: Stage, detail: string): Check => ({ id, stage, outcome: "pass", points: 0, detail });

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Why a full name doesn't look like a real person's name, or null if it does. */
export function nameProblem(name: string | null | undefined): string | null {
  const raw = (name ?? "").trim();
  if (!raw) return "is empty";
  if (/\d/.test(raw)) return "contains digits";
  if (/[@#$%^&*_=+<>{}[\]|\\/~`]/.test(raw)) return "contains symbols";
  const key = nameKey(raw);
  if (PLACEHOLDER_NAMES.has(key) || key.split(" ").every((p) => PLACEHOLDER_NAMES.has(p))) return "is a placeholder";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "has no last name";
  if (!parts.every((p) => /^\p{L}[\p{L}'’.\-]*$/u.test(p))) return "has characters names don't use";
  if (parts.filter((p) => p.replace(/[^\p{L}]/gu, "").length >= 2).length < 1) return "is only initials";
  const mash = parts.find((p) => looksLikeMash(p));
  if (mash) return `looks like random letters (“${mash}”)`;
  if (analyzeText(raw).some((h) => h.score >= 4)) return "contains language that isn't allowed";
  return null;
}

function identityChecks(a: AccountInput): Check[] {
  const checks: Check[] = [];

  const np = nameProblem(a.fullName);
  checks.push(
    np
      ? { id: "tutor_name", stage: "identity", outcome: "fail", points: 30, detail: `The tutor's full name ${np}.`, evidence: [a.fullName], tutorHint: "Use your real first and last name on your account." }
      : pass("tutor_name", "identity", "Full name looks like a real name."),
  );

  if (!a.guardianName || !a.guardianEmail) {
    checks.push({ id: "guardian_present", stage: "identity", outcome: "fail", points: 30, detail: "No parent or guardian on file.", tutorHint: "Add your parent or guardian so they can approve." });
    return checks;
  }

  const gp = nameProblem(a.guardianName);
  checks.push(
    gp
      ? { id: "guardian_name", stage: "identity", outcome: "warn", points: 15, detail: `The parent's name ${gp}.`, evidence: [a.guardianName], tutorHint: "Check your parent or guardian's full name." }
      : pass("guardian_name", "identity", "Parent's name looks like a real name."),
  );

  // The parent's approval is only worth something if a different person gave it.
  const tutorInbox = canonicalEmail(a.email);
  const parentInbox = canonicalEmail(a.guardianEmail);
  const tutorKey = nameKey(a.fullName);
  const [tFirst = "", ...tRest] = tutorKey.split(" ");
  const tLast = tRest[tRest.length - 1] ?? "";
  const parentLocal = parentInbox.split("@")[0].replace(/[^a-z]/g, "");
  if (tutorInbox && tutorInbox === parentInbox) {
    checks.push({
      id: "guardian_self",
      stage: "identity",
      outcome: "fail",
      hard: true,
      points: 60,
      detail: "The parent's email delivers to the tutor's own inbox (same address apart from dots or a +tag).",
      evidence: [a.email, a.guardianEmail],
      tutorHint: "Your parent or guardian needs their own email address.",
    });
  } else if (nameKey(a.guardianName) === tutorKey || (a.guardianApprovedName && nameKey(a.guardianApprovedName) === tutorKey)) {
    checks.push({ id: "guardian_self", stage: "identity", outcome: "fail", hard: true, points: 60, detail: "The parent's name is the tutor's own name.", evidence: [a.guardianName, a.guardianApprovedName ?? ""].filter(Boolean) });
  } else if (tFirst.length >= 3 && tLast.length >= 3 && parentLocal.includes(tFirst) && parentLocal.includes(tLast)) {
    checks.push({
      id: "guardian_self",
      stage: "identity",
      outcome: "warn",
      points: 20,
      detail: "The parent's email address contains the tutor's first and last name. It may be the tutor's own second account.",
      evidence: [a.guardianEmail],
    });
  } else {
    checks.push(pass("guardian_self", "identity", "Parent's email and name are distinct from the tutor's."));
  }
  if (a.guardianApprovedName && nameKey(a.guardianApprovedName) !== nameKey(a.guardianName)) {
    const sameLast = nameKey(a.guardianApprovedName).split(" ").pop() === nameKey(a.guardianName).split(" ").pop();
    if (!sameLast)
      checks.push({
        id: "guardian_signed_as",
        stage: "identity",
        outcome: "warn",
        points: 10,
        detail: "The person who approved signed with a different name than the parent the tutor listed.",
        evidence: [a.guardianName, a.guardianApprovedName],
      });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Profile text
// ---------------------------------------------------------------------------

const HARD_PROFILE = new Set(["sexual", "grooming_secrecy", "threat", "hate"]);

function profileChecks(a: AccountInput): Check[] {
  const checks: Check[] = [];
  const bio = (a.bio ?? "").trim();

  if (!bio) {
    checks.push({ id: "bio_present", stage: "profile", outcome: "warn", points: 5, detail: "No bio.", tutorHint: "Add a short intro about the music you play and how you teach." });
  } else {
    const n = normalize(bio);
    const tokens = tokenize(n.words).map((t) => t.token);

    // Safety lexicon, weighted for a tutor.
    const hits = analyzeText(bio).filter((h) => h.category !== "profanity" || h.score >= 3);
    const serious = hits.filter((h) => HARD_PROFILE.has(h.category) && h.score >= 7);
    if (serious.length) {
      checks.push({
        id: "bio_safety",
        stage: "profile",
        outcome: "fail",
        hard: true,
        points: 60,
        detail: `The bio contains ${serious.map((h) => h.category.replace(/_/g, " ")).join(", ")} language.`,
        evidence: serious.flatMap((h) => h.evidence.map((e) => e.match)),
      });
    } else if (hits.some((h) => h.score >= 4)) {
      const h = hits.filter((x) => x.score >= 4);
      checks.push({
        id: "bio_safety",
        stage: "profile",
        outcome: "fail",
        points: 30,
        detail: `The bio contains ${h.map((x) => x.category.replace(/_/g, " ")).join(", ")} language.`,
        evidence: h.flatMap((x) => x.evidence.map((e) => e.match)),
        tutorHint: "Keep your bio about music and teaching.",
      });
    } else {
      checks.push(pass("bio_safety", "profile", "No unsafe language in the bio."));
    }

    // Contact details or links: the site's message filter, applied to the bio.
    const contact = messageViolation(bio);
    if (contact)
      checks.push({ id: "bio_contact", stage: "profile", outcome: "fail", points: 30, detail: `The bio includes ${contact}.`, tutorHint: `Remove ${contact} from your bio — all contact stays on the site.` });

    if (COMMERCIAL.test(n.base) || COMMERCIAL.test(n.words))
      checks.push({
        id: "bio_commercial",
        stage: "profile",
        outcome: "fail",
        points: 30,
        detail: "The bio mentions prices, payment or paid lessons. Lessons here are always free.",
        evidence: [quote(bio)],
        tutorHint: "Lessons here are always free — remove anything about rates or payment.",
      });

    // Volunteers are high schoolers. A stated adult age is a person this program isn't for.
    const ages = statedAges(n.base);
    const adult = ages.find((x) => x >= 19);
    const young = ages.find((x) => x <= 12);
    if (adult !== undefined)
      checks.push({ id: "bio_age", stage: "profile", outcome: "fail", points: 35, detail: `The bio says the tutor is ${adult}. Tutors are high school students.`, evidence: [quote(bio)] });
    else if (young !== undefined)
      checks.push({ id: "bio_age", stage: "profile", outcome: "warn", points: 15, detail: `The bio says the tutor is ${young}. Tutors are high school students.`, evidence: [quote(bio)] });

    if (tokens.length >= 8) {
      const stop = tokens.filter((t) => STOPWORDS.has(t)).length / tokens.length;
      const mash = tokens.filter((t) => t.length >= 4 && looksLikeMash(t)).length / tokens.length;
      if (stop < 0.08 || mash > 0.3)
        checks.push({ id: "bio_language", stage: "profile", outcome: "warn", points: 15, detail: "The bio doesn't read like normal sentences.", evidence: [quote(bio)], tutorHint: "Write your bio in full sentences." });
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      const [word, most] = [...counts].sort((x, y) => y[1] - x[1])[0];
      if (most >= 6 && most / tokens.length > 0.3 && !STOPWORDS.has(word))
        checks.push({ id: "bio_repetition", stage: "profile", outcome: "warn", points: 10, detail: `The bio repeats “${word}” ${most} times.`, tutorHint: "Your bio repeats itself — rewrite it in your own words." });
      if (!tokens.some((t) => MUSIC_TERMS.has(t)))
        checks.push({ id: "bio_music", stage: "profile", outcome: "warn", points: 10, detail: "The bio doesn't mention music, an instrument or teaching.", tutorHint: "Say which instrument you play and how you like to teach." });
    }
    const letters = bio.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6)
      checks.push({ id: "bio_caps", stage: "profile", outcome: "warn", points: 5, detail: "The bio is mostly capital letters.", tutorHint: "Write your bio in normal capitalization." });
  }

  // School: soft signal only. Plenty of real schools have unusual names.
  const school = (a.school ?? "").trim();
  if (!school) checks.push({ id: "school", stage: "profile", outcome: "warn", points: 5, detail: "No school listed.", tutorHint: "Add the high school you attend." });
  else if (analyzeText(school).some((h) => h.score >= 4) || messageViolation(school))
    checks.push({ id: "school", stage: "profile", outcome: "fail", points: 30, detail: "The school name contains language or contact details that aren't allowed.", evidence: [school] });
  else if (!SCHOOL_WORDS.test(normalize(school).words))
    checks.push({ id: "school", stage: "profile", outcome: "warn", points: 5, detail: "The school name doesn't look like a school.", evidence: [school] });
  else checks.push(pass("school", "profile", "School looks like a school."));

  if (a.grade === null || a.grade < 9 || a.grade > 12)
    checks.push({ id: "grade", stage: "profile", outcome: "fail", points: 30, detail: "Tutors must be in grades 9–12.", tutorHint: "Set your grade (9–12) on your profile." });

  if (!a.meetUrl || !/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(a.meetUrl))
    checks.push({ id: "meet_url", stage: "profile", outcome: "warn", points: 5, detail: "No valid Google Meet link yet.", tutorHint: "Add your Google Meet link so you can accept lessons." });

  return checks;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function messageChecks(a: AccountInput): Check[] {
  const checks: Check[] = [];
  const toScan = (m: AccountMessage): ScanMessage => ({ id: m.id, thread_id: m.threadId, sender_id: m.senderSide === "tutor" ? a.tutorId : null, sender_side: m.senderSide, body: m.body, created_at: m.createdAt });
  const mine = a.messages.filter((m) => m.senderSide === "tutor");

  // 1. Every message the tutor sent, scored with the tutor's position of trust in mind.
  const flags = mine.flatMap((m) => flagsForMessage(toScan(m))).filter((f) => f.category !== "self_harm");
  const critical = flags.filter((f) => f.severity === "critical");
  const high = flags.filter((f) => f.severity === "high");
  const medium = flags.filter((f) => f.severity === "medium");
  if (critical.length)
    checks.push({ id: "msg_critical", stage: "messages", outcome: "fail", hard: true, points: 70, detail: `${critical.length} message${critical.length > 1 ? "s" : ""} with serious safety language (${[...new Set(critical.map((f) => f.category))].join(", ")}).`, evidence: critical.slice(0, 3).map((f) => quote(f.excerpt)) });
  if (high.length)
    checks.push({ id: "msg_high", stage: "messages", outcome: "fail", points: 30 + 5 * Math.min(4, high.length - 1), detail: `${high.length} message${high.length > 1 ? "s" : ""} flagged high (${[...new Set(high.map((f) => f.category))].join(", ")}).`, evidence: high.slice(0, 3).map((f) => quote(f.excerpt)) });
  if (medium.length >= 3)
    checks.push({ id: "msg_medium", stage: "messages", outcome: "warn", points: Math.min(25, 5 * medium.length), detail: `${medium.length} messages flagged for review (${[...new Set(medium.map((f) => f.category))].join(", ")}).`, evidence: medium.slice(0, 3).map((f) => quote(f.excerpt)) });

  // 2. Each conversation as a whole.
  const byThread = new Map<string, ScanMessage[]>();
  for (const m of a.messages) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), toScan(m)]);
  const patterns = [...byThread].flatMap(([id, list]) => flagsForConversation(id, a.tutorId, list)).filter((f) => f.author_id === a.tutorId);
  for (const p of patterns) {
    const hard = p.category === "grooming_pattern";
    checks.push({
      id: `pattern_${p.category}`,
      stage: "messages",
      outcome: hard || p.severity === "high" ? "fail" : "warn",
      hard: hard || undefined,
      points: hard ? 70 : p.severity === "high" ? 30 : 15,
      detail: `Conversation pattern: ${p.category.replace(/_/g, " ")}.`,
      evidence: [quote(p.excerpt, 200)],
    });
  }

  // 3. The student's side: a child saying stop, or that it felt wrong.
  const discomfort: string[] = [];
  for (const m of a.messages.filter((x) => x.senderSide === "family")) {
    const w = normalize(m.body).words;
    if (DISCOMFORT.some((d) => d.pattern.test(w))) discomfort.push(quote(m.body));
  }
  if (discomfort.length)
    checks.push({ id: "student_discomfort", stage: "messages", outcome: "fail", points: 30 + 10 * Math.min(3, discomfort.length - 1), detail: `A student told the tutor to stop or that something felt wrong (${discomfort.length} message${discomfort.length > 1 ? "s" : ""}).`, evidence: discomfort.slice(0, 3) });

  if (!checks.length) checks.push(pass("messages", "messages", mine.length ? `${mine.length} message${mine.length > 1 ? "s" : ""} in the last 30 days, none flagged.` : "No messages in the last 30 days."));
  return checks;
}

// ---------------------------------------------------------------------------
// Conduct & attendance
// ---------------------------------------------------------------------------

function conductChecks(a: AccountInput): Check[] {
  const checks: Check[] = [];
  if (a.openFlags.critical) checks.push({ id: "open_flags", stage: "conduct", outcome: "fail", hard: true, points: 70, detail: `${a.openFlags.critical} critical safety flag${a.openFlags.critical > 1 ? "s" : ""} still open.` });
  else if (a.openFlags.high) checks.push({ id: "open_flags", stage: "conduct", outcome: "fail", points: 30, detail: `${a.openFlags.high} high safety flag${a.openFlags.high > 1 ? "s" : ""} still open.` });
  else if (a.openFlags.medium >= 2) checks.push({ id: "open_flags", stage: "conduct", outcome: "warn", points: 10, detail: `${a.openFlags.medium} safety flags waiting for review.` });

  if (a.reports.open) checks.push({ id: "reports", stage: "conduct", outcome: "fail", points: 35, detail: `${a.reports.open} open report${a.reports.open > 1 ? "s" : ""} involve this tutor.` });
  else if (a.reports.last90) checks.push({ id: "reports", stage: "conduct", outcome: "warn", points: 10, detail: `${a.reports.last90} report${a.reports.last90 > 1 ? "s" : ""} in the last 90 days (resolved).` });

  if (!checks.length) checks.push(pass("conduct", "conduct", "No open flags or reports."));
  return checks;
}

function attendanceChecks(a: AccountInput): Check[] {
  const { logged, studentSaidAbsent: absent, loggedWithoutJoining: noJoin } = a.attendance;
  const checks: Check[] = [];
  if (absent >= 2 && absent / Math.max(1, logged) >= 0.25)
    checks.push({ id: "attendance_disputes", stage: "attendance", outcome: "fail", points: 35, detail: `Students said the tutor wasn't there for ${absent} of ${logged} logged lessons (90 days).`, tutorHint: "Students said you weren't at some lessons you logged. Only log lessons that happened." });
  else if (absent >= 1)
    checks.push({ id: "attendance_disputes", stage: "attendance", outcome: "warn", points: 10, detail: `A student said the tutor wasn't there for ${absent} logged lesson${absent > 1 ? "s" : ""} (90 days).` });
  if (noJoin >= 3 && noJoin / Math.max(1, logged) >= 0.5)
    checks.push({ id: "attendance_no_join", stage: "attendance", outcome: "warn", points: 15, detail: `${noJoin} of ${logged} logged lessons were never opened from the site by the tutor.`, tutorHint: "Join lessons with the Join button on the lesson card so your attendance is recorded." });
  if (!checks.length) checks.push(pass("attendance", "attendance", logged ? `${logged} logged lesson${logged > 1 ? "s" : ""}, no attendance problems.` : "No lessons logged yet."));
  return checks;
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export function verifyAccount(a: AccountInput): Verification {
  const checks = [...identityChecks(a), ...profileChecks(a), ...messageChecks(a), ...conductChecks(a), ...attendanceChecks(a)];
  const risk = Math.min(100, checks.reduce((s, c) => s + c.points, 0));
  const hard = checks.filter((c) => c.outcome === "fail" && c.hard);
  const fails = checks.filter((c) => c.outcome === "fail");
  const decision: Decision = hard.length ? "blocked" : fails.length || risk >= REVIEW_AT ? "review" : "verified";
  const problems = checks.filter((c) => c.outcome !== "pass").sort((x, y) => y.points - x.points);
  const summary =
    decision === "verified"
      ? problems.length
        ? `Verified with ${problems.length} minor note${problems.length > 1 ? "s" : ""}: ${problems.map((c) => c.detail).join(" ")}`
        : "Verified: every check passed."
      : `${decision === "blocked" ? "Blocked" : "Needs review"}: ${problems.slice(0, 3).map((c) => c.detail).join(" ")}`;
  return {
    tutorId: a.tutorId,
    decision,
    risk,
    checks,
    summary: quote(summary, 600),
    tutorHints: [...new Set(problems.map((c) => c.tutorHint).filter((h): h is string => Boolean(h)))],
    version: PIPELINE_VERSION,
  };
}
