/**
 * Teach for a Cause — safety analysis (no AI, no external APIs).
 *
 * Pipeline for one piece of text:
 *   normalize → match lexicon rules → negation check → per-category score
 *   → severity → recommended automatic actions (depends on who wrote it).
 *
 * Then, per conversation (last 14 days), patterns no single message shows:
 *   - grooming_pattern: a tutor combining 2+ grooming signals (secrecy,
 *     personal questions, affection, meeting, moving off-platform, gifts,
 *     sexual) across messages
 *   - bullying_pattern: 3+ harassing messages from one side
 *   - contact_pressure: 3+ attempts to move contact off the platform
 *   - late_night_contact: a tutor messaging a student 11 PM–6 AM ET, 3+ times
 *
 * Severity → what happens (see policy() below):
 *   critical  admins emailed; message hidden; if a tutor wrote it and it's
 *             sexual/grooming/threat/scam, the tutor is paused (lessons cancelled)
 *   high      admins emailed; message hidden
 *   medium    queued for admin review
 *   low       recorded only
 *   Self-harm is always "notify, never hide": a student reaching out for help
 *   must not disappear — an adult needs to see it.
 */
import { NEGATIONS, RULES, type Category } from "./lexicon";
import { normalize, tokenize } from "./normalize";

export type Severity = "low" | "medium" | "high" | "critical";
export type Side = "tutor" | "family";
export type Action = "hide_message" | "pause_tutor";
export type PatternCategory = "grooming_pattern" | "bullying_pattern" | "contact_pressure" | "late_night_contact";

export interface Evidence {
  rule: string;
  match: string;
  weight: number;
  negated: boolean;
}

export interface CategoryHit {
  category: Category;
  score: number; // 0–10
  severity: Severity;
  evidence: Evidence[];
}

export const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function severityFor(score: number): Severity | null {
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  if (score >= 2) return "low";
  return null;
}

const NEGATION_FACTOR = 0.4;

/** Scores one piece of text. Returns one hit per category that fired, strongest first. */
export function analyzeText(text: string): CategoryHit[] {
  const n = normalize(text);
  if (!n.words && !n.base) return [];
  const tokens = tokenize(n.words);
  const byCat = new Map<Category, Evidence[]>();

  for (const rule of RULES) {
    const matches: { text: string; index: number; inWords: boolean }[] = [];
    if (rule.pattern) {
      const re = new RegExp(rule.pattern.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(n.words))) {
        matches.push({ text: m[0], index: m.index, inWords: true });
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    if (rule.basePattern) {
      const m = rule.basePattern.exec(n.base);
      if (m) matches.push({ text: m[0].trim(), index: m.index, inWords: false });
    }
    if (!matches.length) continue;

    // Use the strongest occurrence (a non-negated one if any).
    let best: Evidence | null = null;
    for (const m of matches) {
      let negated = false;
      if (rule.negatable && m.inWords) {
        const before = tokens.filter((t) => t.start < m.index).slice(-3);
        negated = before.some((t) => NEGATIONS.has(t.token));
      }
      const weight = negated ? rule.weight * NEGATION_FACTOR : rule.weight;
      if (!best || weight > best.weight) best = { rule: rule.id, match: m.text.slice(0, 80), weight: round1(weight), negated };
    }
    const list = byCat.get(rule.category) ?? [];
    list.push(best!);
    byCat.set(rule.category, list);
  }

  const hits: CategoryHit[] = [];
  for (const [category, evidence] of byCat) {
    evidence.sort((a, b) => b.weight - a.weight);
    // Strongest rule + a little for each additional distinct rule, capped at 10.
    const score = Math.min(10, evidence[0].weight + evidence.slice(1).reduce((a, e) => a + e.weight * 0.25, 0));
    const severity = severityFor(score);
    if (severity) hits.push({ category, score: round1(score), severity, evidence });
  }
  return hits.sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------------------
// Who wrote it changes what we do about it
// ---------------------------------------------------------------------------
const TUTOR_PAUSE_CATEGORIES = new Set<string>(["sexual", "grooming_secrecy", "threat", "scam_link", "grooming_pattern"]);

/**
 * Severity after considering the author. The same words are more serious from
 * a tutor (who holds a position of trust with a younger student).
 */
export function adjustForAuthor(hit: { category: string; score: number }, side: Side): number {
  let score = hit.score;
  if (side === "tutor") {
    if (["sexual", "grooming_secrecy", "personal_probe", "affection", "meeting", "gifts_money"].includes(hit.category)) score += 1;
  } else {
    // Students (usually 11–14) sharing their own feelings or swearing are handled gently;
    // what they say about harming themselves is never downgraded.
    if (hit.category === "profanity" || hit.category === "affection") score -= 1;
  }
  return Math.max(0, Math.min(10, round1(score)));
}

export function policy(category: string, severity: Severity, side: Side | null): Action[] {
  if (category === "self_harm") return [];
  const actions: Action[] = [];
  if (SEVERITY_RANK[severity] >= SEVERITY_RANK.high) actions.push("hide_message");
  if (side === "tutor" && severity === "critical" && TUTOR_PAUSE_CATEGORIES.has(category)) actions.push("pause_tutor");
  return actions;
}

// ---------------------------------------------------------------------------
// Flags (the shape stored by public.moderation_apply)
// ---------------------------------------------------------------------------
export interface Flag {
  source_type: "message" | "thread" | "session_note" | "profile_bio" | "student_note" | "tutor_offer";
  source_id: string;
  message_id?: string | null;
  thread_id?: string | null;
  author_id?: string | null;
  category: string;
  severity: Severity;
  score: number;
  evidence: unknown[];
  excerpt: string;
  actions: Action[];
}

export interface ScanMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_side: Side;
  body: string;
  created_at: string;
}

const excerpt = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Flags for a single message. */
export function flagsForMessage(m: ScanMessage): Flag[] {
  return analyzeText(m.body).flatMap((hit) => {
    const score = adjustForAuthor(hit, m.sender_side);
    const severity = severityFor(score);
    if (!severity) return [];
    return [
      {
        source_type: "message" as const,
        source_id: m.id,
        message_id: m.id,
        thread_id: m.thread_id,
        author_id: m.sender_id,
        category: hit.category,
        severity,
        score,
        evidence: hit.evidence,
        excerpt: excerpt(m.body),
        actions: policy(hit.category, severity, m.sender_side),
      },
    ];
  });
}

/** Flags for free text that isn't a message (bios, notes). Recorded for review; never auto-actioned. */
export function flagsForText(sourceType: Flag["source_type"], sourceId: string, authorId: string | null, body: string): Flag[] {
  return analyzeText(body).map((hit) => ({
    source_type: sourceType,
    source_id: sourceId,
    author_id: authorId,
    category: hit.category,
    severity: hit.severity,
    score: hit.score,
    evidence: hit.evidence,
    excerpt: excerpt(body),
    actions: [],
  }));
}

// ---------------------------------------------------------------------------
// Conversation-level patterns
// ---------------------------------------------------------------------------
const GROOMING_SIGNALS = new Set<string>(["grooming_secrecy", "personal_probe", "affection", "meeting", "contact_migration", "gifts_money", "sexual"]);

function etHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
}

/**
 * Looks across a conversation's recent messages for patterns. `messages` must
 * all belong to one thread. `tutorId` is the tutor in that thread.
 */
export function flagsForConversation(threadId: string, tutorId: string, messages: ScanMessage[]): Flag[] {
  const flags: Flag[] = [];
  const perSide: Record<Side, { signals: Map<string, Evidence & { message: string }>; harass: string[]; contact: string[] }> = {
    tutor: { signals: new Map(), harass: [], contact: [] },
    family: { signals: new Map(), harass: [], contact: [] },
  };
  let lateNight = 0;
  const lateSamples: string[] = [];

  for (const m of messages) {
    const side = perSide[m.sender_side];
    for (const hit of analyzeText(m.body)) {
      const strongest = hit.evidence[0];
      if (strongest.negated) continue;
      if (GROOMING_SIGNALS.has(hit.category) && hit.score >= 4 && !side.signals.has(hit.category)) {
        side.signals.set(hit.category, { ...strongest, message: m.body });
      }
      if (hit.category === "harassment" && hit.score >= 5) side.harass.push(m.body);
      if (hit.category === "contact_migration") side.contact.push(m.body);
    }
    if (m.sender_side === "tutor") {
      const h = etHour(m.created_at);
      if (h >= 23 || h < 6) {
        lateNight++;
        if (lateSamples.length < 3) lateSamples.push(m.body);
      }
    }
  }

  const tutor = perSide.tutor;
  const distinct = tutor.signals.size;
  if (distinct >= 2) {
    const severity: Severity = distinct >= 3 || tutor.signals.has("grooming_secrecy") || tutor.signals.has("sexual") ? "critical" : "high";
    const ev = [...tutor.signals.entries()].map(([category, e]) => ({ category, rule: e.rule, match: e.match }));
    flags.push({
      source_type: "thread",
      source_id: threadId,
      thread_id: threadId,
      author_id: tutorId,
      category: "grooming_pattern",
      severity,
      score: Math.min(10, 6 + distinct),
      evidence: ev,
      excerpt: excerpt([...tutor.signals.values()].map((e) => `“${e.message}”`).join("  ·  ")),
      actions: policy("grooming_pattern", severity, "tutor").filter((a) => a !== "hide_message"),
    });
  }

  for (const sideName of ["tutor", "family"] as Side[]) {
    const side = perSide[sideName];
    if (side.harass.length >= 3) {
      flags.push({
        source_type: "thread",
        source_id: threadId,
        thread_id: threadId,
        author_id: sideName === "tutor" ? tutorId : null,
        category: "bullying_pattern",
        severity: "high",
        score: 8,
        evidence: [{ side: sideName, count: side.harass.length }],
        excerpt: excerpt(side.harass.slice(0, 3).map((b) => `“${b}”`).join("  ·  ")),
        actions: [],
      });
    }
    if (side.contact.length >= 3) {
      flags.push({
        source_type: "thread",
        source_id: threadId,
        thread_id: threadId,
        author_id: sideName === "tutor" ? tutorId : null,
        category: "contact_pressure",
        severity: sideName === "tutor" ? "high" : "medium",
        score: sideName === "tutor" ? 7.5 : 5,
        evidence: [{ side: sideName, count: side.contact.length }],
        excerpt: excerpt(side.contact.slice(0, 3).map((b) => `“${b}”`).join("  ·  ")),
        actions: [],
      });
    }
  }

  if (lateNight >= 3) {
    flags.push({
      source_type: "thread",
      source_id: threadId,
      thread_id: threadId,
      author_id: tutorId,
      category: "late_night_contact",
      severity: "medium",
      score: 5,
      evidence: [{ count: lateNight, window: "11 PM–6 AM ET" }],
      excerpt: excerpt(lateSamples.map((b) => `“${b}”`).join("  ·  ")),
      actions: [],
    });
  }
  return flags;
}
