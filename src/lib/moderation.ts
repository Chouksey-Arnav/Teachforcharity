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

export const MESSAGE_MAX = 800;
