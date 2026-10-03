/**
 * Client-side mirror of private.message_violation() in the database.
 * It gives instant feedback while typing; the database check is the real gate.
 * Keep both lists in sync (see supabase/migrations/*_program_logic.sql).
 */
const RULES: { reason: string; patterns: RegExp[] }[] = [
  {
    reason: "email addresses",
    patterns: [
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/,
      /\b[a-z0-9._%+-]+\s*[([]?\s*at\s*[)\]]?\s*[a-z0-9-]+\s*[([]?\s*dot\s*[)\]]?\s*(com|net|org|edu)\b/,
    ],
  },
  { reason: "phone numbers", patterns: [/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/] },
  {
    reason: "links",
    patterns: [/(https?:\/\/|www\.)/, /\b[a-z0-9-]+\.(com|net|org|io|gg|me|app|co|us|ly|tv|xyz|link|info|biz)\b/],
  },
  {
    reason: "outside apps, social media, or payment apps",
    patterns: [
      /\b(snapchat|snap chat|insta|instagram|tiktok|tik tok|discord|whatsapp|whats app|telegram|kik|facebook|fb|messenger|twitter|wechat|imessage|facetime|zoom|skype|venmo|cashapp|cash app|zelle|paypal)\b/,
    ],
  },
  { reason: "social media handles", patterns: [/(^|\s)@[a-z0-9_.]{3,}/] },
  {
    reason: "in-person meetups (lessons are online only)",
    patterns: [/\b(meet (up )?in person|come over|my house|your house|my address|home address|pick you up|hang out)\b/],
  },
  {
    reason: "language that is not allowed",
    patterns: [
      /\b(fuck\w*|shit\w*|bitch\w*|asshole\w*|dick|dicks|pussy|cunt\w*|nigg\w*|fag\w*|retard\w*|slut\w*|whore\w*|porn\w*|nude|nudes|naked|sex|sexy|sexual\w*|kys|kill yourself)\b/,
    ],
  },
];

export function messageViolation(text: string): string | null {
  const t = (text ?? "").toLowerCase();
  for (const rule of RULES) if (rule.patterns.some((p) => p.test(t))) return rule.reason;
  return null;
}

/**
 * Every span of `text` that a rule matches, in order and without overlaps, so
 * the public site can highlight exactly what would be blocked. Uses the same
 * rules as messageViolation(); it never decides anything on its own.
 */
export function violationSpans(text: string): { start: number; end: number; reason: string }[] {
  const raw = text ?? "";
  const t = raw.toLowerCase();
  // toLowerCase() can change the length of a few characters (e.g. "İ"); then indexes no longer line up.
  if (t.length !== raw.length) {
    const reason = messageViolation(raw);
    return reason ? [{ start: 0, end: raw.length, reason }] : [];
  }
  const found: { start: number; end: number; reason: string }[] = [];
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      for (const m of t.matchAll(new RegExp(p.source, "g"))) {
        if (!m[0]) continue;
        // Patterns like /(^|\s)@handle/ include the leading space; highlight only the handle.
        const lead = m[0].length - m[0].trimStart().length;
        found.push({ start: m.index + lead, end: m.index + m[0].length, reason: rule.reason });
      }
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: typeof found = [];
  for (const s of found) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged;
}

export const MESSAGE_MAX = 800;
