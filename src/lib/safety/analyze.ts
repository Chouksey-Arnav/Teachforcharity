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
import { clauses, normalize, tokenize } from "./normalize";
import { FRAMES, matchFrames } from "./frames";

export type Severity = "low" | "medium" | "high" | "critical";
export type Side = "tutor" | "family";
export type Action = "hide_message" | "pause_tutor";
export type PatternCategory = "grooming_pattern" | "bullying_pattern" | "contact_pressure" | "late_night_contact";

export interface Evidence {
  rule: string;
  match: string;
  weight: number;
  negated: boolean;
  /** High-precision evidence: the only kind that can trigger an automatic action. */
  precise?: boolean;
  /** Hyperbole context lowered this ("…if I don't make first chair lol"). Still reviewed, never dropped. */
  dampened?: boolean;
  /** Plain English for admins. */
  why?: string;
}

export interface CategoryHit {
  category: Category;
  score: number; // 0–10
  severity: Severity;
  evidence: Evidence[];
  /** True when at least one piece of evidence is high-precision. */
  precise: boolean;
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
/** Hyperbole lowers self-harm to a review item, never below it: a person still reads it. */
const DAMPENED_WEIGHT = 5;
/** Markers that a dramatic phrase is a joke or about a performance, not about their life. */
const HYPERBOLE = /\b(?:lol|lmao|lmfao|haha\w*|jk|just kidding|if i (?:don'?t|do not|fail|mess|miss|have to|get)|first chair|audition|recital|concert|test|exam|so funny|embarrass\w*|cringe|of laughter|laughing|this (?:piece|song|etude|part)|the (?:piece|song|etude|high part|solo))\b/;
/** Rules compiled once, with a global copy for finding every match in a clause. */
const COMPILED = RULES.map((rule) => ({ rule, re: rule.pattern ? new RegExp(rule.pattern.source, "g") : null }));
const CATEGORY_OF = new Map<string, Category>([...RULES.map((r) => [r.id, r.category] as const), ...FRAMES.map((f) => [f.id, f.category] as const)]);
const HYPERBOLE_EMOJI = /[\u{1F602}\u{1F923}\u{1F480}\u{1F62D}]/u; // 😂 🤣 💀 😭

/**
 * Scores one piece of text. Returns one hit per category that fired, strongest first.
 *
 * Every rule runs on each clause separately (so "meet me in the lesson link.
 * then come over" is judged as two thoughts), against the clause's canonical
 * form: look-alike letters mapped, leetspeak and spacing undone, texting
 * shorthand expanded. Patterns that need punctuation (links, emails, phone
 * numbers) run once over the whole message.
 */
export function analyzeText(text: string, side?: Side): CategoryHit[] {
  // The account check and the conversation patterns analyze the same messages again; reuse the result.
  const key = `${side ?? ""}\u0000${text}`;
  const cached = MEMO.get(key);
  if (cached) return cached;
  const hits = analyzeUncached(text, side);
  if (MEMO.size >= MEMO_MAX) MEMO.delete(MEMO.keys().next().value!);
  MEMO.set(key, hits);
  return hits;
}

const MEMO = new Map<string, CategoryHit[]>();
const MEMO_MAX = 20000;

function analyzeUncached(text: string, side?: Side): CategoryHit[] {
  const whole = normalize(text);
  if (!whole.words && !whole.base) return [];
  const byRule = new Map<string, Evidence>();
  const keep = (rule: (typeof RULES)[number], e: Evidence) => {
    const prev = byRule.get(rule.id);
    if (!prev || e.weight > prev.weight) byRule.set(rule.id, e);
  };

  const parts = clauses(text);
  for (const clause of parts.length ? parts : [text]) {
    const n = normalize(clause);
    if (!n.canon) continue;
    const tokens = tokenize(n.canon);
    const hyperbole = HYPERBOLE.test(n.canon) || HYPERBOLE_EMOJI.test(clause);
    for (const f of matchFrames(tokens.map((t) => t.token), side)) {
      const { frame } = f;
      const prev = byRule.get(frame.id);
      if (!prev || frame.weight > prev.weight)
        byRule.set(frame.id, { rule: frame.id, match: f.match, weight: frame.weight, negated: false, precise: Boolean(frame.precise), why: frame.why });
    }
    for (const { rule, re } of COMPILED) {
      if (!re) continue;
      if (rule.from && side && rule.from !== side) continue;
      re.lastIndex = 0;
      if (!re.test(n.canon)) continue;
      if (rule.unless && rule.unless.test(n.canon)) continue;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(n.canon))) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        let negated = false;
        if (rule.negatable) {
          const before = tokens.filter((t) => t.start < m!.index).slice(-3);
          negated = before.some((t) => NEGATIONS.has(t.token));
        }
        let weight = negated ? rule.weight * NEGATION_FACTOR : rule.weight;
        const dampened = Boolean(rule.dampen && hyperbole && weight > DAMPENED_WEIGHT);
        if (dampened) weight = DAMPENED_WEIGHT;
        keep(rule, { rule: rule.id, match: m[0].trim().slice(0, 80), weight: round1(weight), negated, precise: Boolean(rule.precise) && !negated && !dampened, dampened: dampened || undefined, why: rule.why });
      }
    }
  }
  for (const rule of RULES) {
    if (!rule.basePattern) continue;
    const m = rule.basePattern.exec(whole.base);
    if (m) keep(rule, { rule: rule.id, match: m[0].trim().slice(0, 80), weight: rule.weight, negated: false, precise: Boolean(rule.precise), why: rule.why });
  }

  const byCat = new Map<Category, Evidence[]>();
  for (const [id, e] of byRule) {
    const cat = CATEGORY_OF.get(id)!;
    byCat.set(cat, [...(byCat.get(cat) ?? []), e]);
  }
  const hits: CategoryHit[] = [];
  for (const [category, evidence] of byCat) {
    evidence.sort((a, b) => b.weight - a.weight);
    // Strongest rule + a little for each additional distinct rule, capped at 10.
    const score = Math.min(10, evidence[0].weight + evidence.slice(1).reduce((a, e) => a + e.weight * 0.25, 0));
    const severity = severityFor(score);
    if (severity) hits.push({ category, score: round1(score), severity, evidence, precise: evidence.some((e) => e.precise) });
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
    if (["sexual", "grooming_secrecy", "isolation", "personal_probe", "affection", "meeting", "gifts_money"].includes(hit.category)) score += 1;
  } else {
    // Students (usually 11–14) sharing their own feelings or swearing are handled gently;
    // what they say about harming themselves is never downgraded.
    if (hit.category === "profanity" || hit.category === "affection") score -= 1;
  }
  return Math.max(0, Math.min(10, round1(score)));
}

/** A child asking for help, or saying something felt wrong, must reach an adult: never hidden. */
const NEVER_HIDE = new Set<string>(["self_harm", "disclosure"]);

/**
 * What happens automatically. Only high-precision evidence (`precise`) can
 * hide a message or pause a tutor; everything else is queued for a person,
 * and high/critical flags email the admins either way. A fuzzy signal must
 * never punish someone on its own.
 */
export function policy(category: string, severity: Severity, side: Side | null, precise = true): Action[] {
  if (NEVER_HIDE.has(category) || !precise) return [];
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
  return analyzeText(m.body, m.sender_side).flatMap((hit) => {
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
        actions: policy(hit.category, severity, m.sender_side, hit.precise),
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
const GROOMING_SIGNALS = new Set<string>(["grooming_secrecy", "isolation", "personal_probe", "affection", "meeting", "contact_migration", "gifts_money", "sexual"]);

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
    for (const hit of analyzeText(m.body, m.sender_side)) {
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
    // Three different kinds of signal, or one unmistakable secrecy/sexual message, is critical.
    const strong = (c: string) => Boolean(tutor.signals.get(c)?.precise);
    const severity: Severity = distinct >= 3 || strong("grooming_secrecy") || strong("sexual") ? "critical" : "high";
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
