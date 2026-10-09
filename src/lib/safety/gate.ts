/**
 * The message gate: what can't be sent at all. It runs before anything is
 * saved, in two places that must agree exactly:
 *
 *   - here, for instant feedback while typing and in server actions
 *   - private.gate_check() in the database, the real gate (no way around it)
 *
 * The SQL is GENERATED from this file by scripts/gen-message-gate.mjs, and a
 * test fails if the latest migration doesn't match, so the two can't drift.
 * Anything here must therefore be expressible in Postgres: single-character
 * maps, and regexes using only \b, \d, \s, classes, groups and quantifiers
 * (no lookaround, no flags, no `[]`-style tricks).
 *
 * Each rule runs on one "view" of the text, built to undo a family of tricks:
 *
 *   base    NFKC (fullwidth ＠, 𝐛𝐨𝐥𝐝 letters), invisible characters removed,
 *           look-alike letters mapped (Cyrillic "ѕnар"), accents stripped,
 *           lowercased, anything else non-ASCII (emoji, other scripts) → space.
 *           Punctuation kept: emails, links, handles.
 *   canon   words only: "s n a p" / "s.n.a.p" joined, leetspeak undone
 *           ("sn@pch4t"), punctuation dropped, "soooo" shortened, texting
 *           shorthand expanded ("u" → "you", "ig" → "instagram").
 *   squash  canon's letters with every gap removed ("sn ap ch at").
 *   digits  number runs, with "nine one nine" → 919 and "555-I234" → 5551234,
 *           each run written as its digit groups joined by "-".
 *
 * What it deliberately does NOT block: anything about self-harm or a student
 * saying something felt wrong. Those must reach an adult (the safety scanner
 * alerts the team) and must never bounce back at a child.
 */

export type GateView = "base" | "canon" | "squash" | "digits";
export type GateCategory = "contact" | "meetup" | "language" | "secrecy" | "probe" | "photo" | "affection" | "money" | "scam";

export interface GateRule {
  id: string;
  category: GateCategory;
  /** Finishes "messages can't include …". */
  reason: string;
  view: GateView;
  pattern: string;
  /** If this matches the same view, the rule doesn't apply ("meet up in the lesson link"). */
  unless?: string;
  /** Also required, on another view (a phone-ish word AND a long number). */
  also?: { view: GateView; pattern: string };
  /** Only for text known to be written by this side (a tutor's chat, notes and homework). */
  side?: "tutor";
}

// ---------------------------------------------------------------------------
// Normalization data (single characters only, so SQL translate() can mirror it)
// ---------------------------------------------------------------------------
export const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic, lower and upper
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ї: "i", ј: "j", ѕ: "s", ԁ: "d", ԛ: "q", ԝ: "w", ү: "y", һ: "h", ӏ: "l", ɡ: "g",
  А: "a", В: "b", Е: "e", К: "k", М: "m", Н: "h", О: "o", Р: "p", С: "c", Т: "t", У: "y", Х: "x", Ѕ: "s", І: "i", Ј: "j", Ү: "y",
  // Greek, lower and upper
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ω: "w",
  Α: "a", Β: "b", Ε: "e", Η: "h", Ι: "i", Κ: "k", Μ: "m", Ν: "n", Ο: "o", Ρ: "p", Τ: "t", Υ: "y", Χ: "x", Ζ: "z",
  // Other look-alikes
  ı: "i", ł: "l", ø: "o", đ: "d", ħ: "h",
};

/** Leetspeak, applied only inside tokens that already contain a letter ("5 min" stays "5 min"). */
export const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i", "|": "l", "+": "t" };

/** Texting shorthand → the words the rules are written in (whole tokens of canon only). */
export const SLANG: Record<string, string> = {
  u: "you", ya: "you", yu: "you", ur: "your", yur: "your", r: "are", youre: "you're", "u're": "you're",
  ig: "instagram", insta: "instagram", fb: "facebook",
  pic: "picture", pics: "pictures", pix: "pictures", piccy: "picture", vid: "video", vids: "videos",
  msg: "message", msgs: "messages", convo: "conversation", convos: "conversations", txt: "text",
  pls: "please", plz: "please", rn: "right now", tn: "tonight", tonite: "tonight", bf: "boyfriend", gf: "girlfriend",
  dont: "don't", wont: "won't", cant: "can't", im: "i'm", ill: "i'll", whats: "what's", thats: "that's", lets: "let's",
  luv: "love", wanna: "want to", gonna: "going to", sum1: "someone", no1: "no one", ppl: "people",
};

export const NUMBER_WORDS: Record<string, string> = { zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };

/** Invisible and direction-changing characters that split a word without showing. */
export const INVISIBLE = "[\\u00ad\\u180e\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2064\\ufeff]";
/** Combining marks (accents, "zalgo" text) left over after NFD. */
export const MARKS = "[\\u0300-\\u036f\\u1ab0-\\u1aff\\u1dc0-\\u1dff\\u20d0-\\u20ff\\ufe20-\\ufe2f]";
/**
 * Whatever is still not plain ASCII after all that (other scripts, emoji) becomes a space:
 * "snap😂chat" reads as "snap chat", and word boundaries mean the same thing in
 * JavaScript and Postgres (which disagree about whether "ж" is a letter).
 */
export const NON_ASCII = "[^\\u0001-\\u007f]";
/** Letters typed with gaps: "s n a p", "s.n.a.p", "s-n-a-p". */
export const SPACED = "\\b(?:[a-z0-9@$][ ._*-]){2,}[a-z0-9@$]\\b";
/** Punctuation ending a token, left alone by leetspeak ("snapchat!" isn't "snapchati"). */
export const TRAILING = "[!?.,;:)'\"]+$";
/** A run of digit groups: "919 555-1234", "9 1 9 5 5 5". */
export const DIGIT_RUN = "\\d+(?:[\\s._()/|+*-]{1,3}\\d+)*";

// ---------------------------------------------------------------------------
// Rules. Order matters: the first match decides the reason shown.
// ---------------------------------------------------------------------------
const w = (s: string) => `\\b(?:${s})\\b`;
const TLD = "com|net|org|io|gg|me|app|co|us|ly|tv|xyz|link|info|biz";
const PARENT = "(?:mom|mum|mother|dad|father|parents|parent|family|guardian|guardians)";
const MUSIC = w("play|plays|playing|practice|practicing|perform|performing|hold|holding|posture|hand|hands|finger|fingers|fingering|embouchure|bow|bowing|setup|instrument|stand|sheet|music|score|reed|mouthpiece|sticks|grip|page|part|assignment");

const R = {
  email: "email addresses",
  phone: "phone numbers",
  links: "links",
  apps: "outside apps, social media, or payment apps",
  handles: "social media handles",
  offsite: "requests to talk somewhere other than this site",
  meetup: "in-person meetups (lessons are online only)",
  language: "language that is not allowed",
  secrecy: "requests to keep secrets from parents or delete messages",
  probe: "personal questions about being home alone, parents’ whereabouts, or where someone lives",
  photo: "requests for photos of a person (photos of playing or sheet music are fine)",
  affection: "comments on someone’s looks or romantic language",
  money: "gifts or money (lessons are always free)",
  scam: "requests for passwords or login codes",
} as const;

export const GATE_RULES: GateRule[] = [
  // ---- Email ----
  { id: "email_address", category: "contact", reason: R.email, view: "base", pattern: "[a-z0-9._%+-]+@[a-z0-9-]+" },
  { id: "email_spelled", category: "contact", reason: R.email, view: "base", pattern: "\\b[a-z0-9._%+-]+\\s*[([]?\\s*at\\s*[)\\]]?\\s*[a-z0-9-]+\\s*[([]?\\s*dot\\s*[)\\]]?\\s*(?:com|net|org|edu)\\b" },
  { id: "email_provider", category: "contact", reason: R.email, view: "canon", pattern: w("gmail|hotmail|icloud|ymail|protonmail|aol mail|yahoo mail|outlook com") },

  // ---- Phone ----
  { id: "phone_formatted", category: "contact", reason: R.phone, view: "base", pattern: "(?:\\+?1[\\s.-]?)?\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}" },
  { id: "phone_local", category: "contact", reason: R.phone, view: "base", pattern: "\\b[2-9]\\d{2}[.-]\\d{4}\\b" },
  // A US number (area code and exchange start 2–9) written one digit at a time, or starting with a group of three.
  { id: "phone_single_digits", category: "contact", reason: R.phone, view: "digits", pattern: " (?:1-)?[2-9]-\\d-\\d-[2-9](?:-\\d){6} " },
  { id: "phone_grouped", category: "contact", reason: R.phone, view: "digits", pattern: " (?:1-?)?[2-9]\\d\\d-?[2-9](?:-?\\d){6} " },
  { id: "phone_with_cue", category: "contact", reason: R.phone, view: "canon", pattern: w("my number|your number|phone|cell|call me|text me|reach me|digits"), also: { view: "digits", pattern: " \\d(?:-?\\d){6,} " } },

  // ---- Links ----
  { id: "link_scheme", category: "contact", reason: R.links, view: "base", pattern: "https?://|www\\." },
  { id: "link_domain", category: "contact", reason: R.links, view: "base", pattern: `\\b[a-z0-9-]+\\.(?:${TLD})\\b` },
  { id: "link_defanged", category: "contact", reason: R.links, view: "base", pattern: `[a-z0-9-]+\\s*[[({]\\s*(?:\\.|dot)\\s*[)}\\]]\\s*(?:${TLD})\\b` },
  { id: "link_words", category: "contact", reason: R.links, view: "canon", pattern: `\\b[a-z0-9]+ dot (?:com|net|org|io|gg|me|app|tv|xyz)\\b|\\bwww?\\b|\\bwww?[a-z0-9]|\\bhttps?\\b|\\bbit ly\\b|\\btinyurl\\b` },

  // ---- Outside apps ----
  {
    id: "app_name",
    category: "contact",
    reason: R.apps,
    view: "canon",
    pattern: w(
      "snapchat|snap chat|instagram|tiktok|tik tok|discord|whatsapp|whats app|telegram|kik|facebook|messenger|twitter|wechat|imessage|facetime|zoom|skype|venmo|cashapp|cash app|zelle|paypal|onlyfans|groupme|google voice|signal app",
    ),
  },
  { id: "app_name_squashed", category: "contact", reason: R.apps, view: "squash", pattern: "snapchat|instagram|whatsapp|telegram|facebook|onlyfans" },
  { id: "handle_at", category: "contact", reason: R.handles, view: "base", pattern: "(?:^|\\s)@[a-z0-9_.]{3,}" },
  { id: "handle_words", category: "contact", reason: R.handles, view: "canon", pattern: w("my (?:user ?name|handle|gamertag|gamer tag|tag) is|your (?:user ?name|handle|gamertag|gamer tag)") },
  {
    id: "offsite_ask",
    category: "contact",
    reason: R.offsite,
    view: "canon",
    pattern: w(
      "my snap|your snap|on snap|snap me|my sc|your sc|on sc|sc me|dm me|text me|call me (?:at|on|tonight|later|when|after)|message me on|add me on|add me at|hit me up|my cell|your cell|my phone number|your phone number|my number is|what's your number|facetime me|email me|my email|your email",
    ),
  },

  // ---- In person ----
  { id: "meet_up", category: "meetup", reason: R.meetup, view: "canon", pattern: w("meet up|meet me at|meet you at|meet (?:up )?in person|in person lessons?|lessons? in person"), unless: w("lesson link|the link|google meet|the meet|meet link|online|on here|on the site|waiting room") },
  { id: "meet_visit", category: "meetup", reason: R.meetup, view: "canon", pattern: w("irl|in real life|come over|my house|your house|my place|my address|your address|home address|pick you up|give you a ride|sleep ?over|hang out|hangout|come to my|visit you|drive you") },

  // ---- Language ----
  {
    id: "bad_language",
    category: "language",
    reason: R.language,
    view: "canon",
    pattern: w("fuck\\w*|fck\\w*|phuck\\w*|fuk\\w*|shit\\w*|bitch\\w*|asshole\\w*|dick|dicks|pussy|cunt\\w*|nigg\\w*|fag\\w*|retard\\w*|slut\\w*|whore\\w*|porn\\w*|nude|nudes|noodz|nudez|naked|sex|sexy|sexual\\w*|kys|kill yourself"),
  },

  // ---- Grooming signals: things no lesson message ever needs ----
  { id: "secret_tell", category: "secrecy", reason: R.secrecy, view: "canon", pattern: w(`(?:don't|do not|never) tell (?:your|anyone|anybody|no one|nobody)|without your ${PARENT} knowing`) },
  {
    id: "secret_keep",
    category: "secrecy",
    reason: R.secrecy,
    view: "canon",
    pattern: w(
      "our (?:little )?secret|keep (?:this|it|that|this chat|our chats?|our messages|our talks?|our conversations?) (?:a )?(?:secret|private|to yourself|between us)|just between us|between the two of us|stays between us|(?:no one|nobody) (?:needs|has) to know",
    ),
  },
  { id: "secret_delete", category: "secrecy", reason: R.secrecy, view: "canon", pattern: w("(?:delete|erase|wipe|clear) (?:all )?(?:of )?(?:this |these |the |our |those |that |my |your )?(?:message|messages|chat|chats|conversation|conversations|dms|history)") },
  { id: "probe_alone", category: "probe", reason: R.probe, view: "canon", pattern: w("are you (?:home )?alone|home alone|by yourself right now|is (?:anyone|anybody) (?:else )?(?:home|in the house|there with you)") },
  {
    id: "probe_parents",
    category: "probe",
    reason: R.probe,
    view: "canon",
    pattern: w(`(?:are|is) your ${PARENT} (?:home|around|there|asleep|awake|out|away|gone|at work)|when (?:do|does) your ${PARENT} (?:go to (?:bed|sleep|work)|leave|get home)`),
    unless: w("lesson|lessons|join|sign|consent|form|say hi|meet them|nearby"),
  },
  { id: "probe_room", category: "probe", reason: R.probe, view: "canon", pattern: w("is your (?:bedroom |room )?door (?:locked|closed|shut)|lock your door|show me your (?:room|bedroom|bed)") },
  { id: "probe_where", category: "probe", reason: R.probe, view: "canon", pattern: w("where do you live|what's your address|what street do you live|which house is yours") },
  {
    id: "photo_of_you",
    category: "photo",
    reason: R.photo,
    view: "canon",
    pattern: w("(?:send|show|take|snap|post|text) (?:me |us )?(?:a |some |another |more |the )?(?:picture|pictures|photo|photos|selfie|selfies) of (?:you|yourself)|selfie|selfies"),
    unless: MUSIC,
  },
  { id: "photo_body", category: "photo", reason: R.photo, view: "canon", pattern: w("(?:picture|pictures|photo|photos) of your (?:body|legs|chest|feet)|take (?:off )?your (?:clothes|shirt|pants)|in your (?:underwear|bra)") },
  { id: "photo_wearing", category: "photo", reason: R.photo, view: "canon", pattern: w("what are you wearing|what you're wearing|in your (?:pajamas|pjs|bed)"), unless: w("concert|recital|performance|perform|uniform|audition|gig|competition|black") },
  {
    id: "affection_love",
    category: "affection",
    reason: R.affection,
    view: "canon",
    side: "tutor",
    pattern: w("i love you|i miss you|thinking about you|can't stop thinking about you|kiss you|be my (?:girlfriend|boyfriend)|date me|go out with me|my favorite student|special to me"),
  },
  {
    id: "affection_looks",
    category: "affection",
    reason: R.affection,
    view: "canon",
    side: "tutor",
    pattern: w(
      "(?:you're|you are|you look|you looked|your so) (?:so |really |very |super |honestly |kinda |lowkey )*(?:cute|pretty|beautiful|gorgeous|hot|sexy|attractive|handsome|adorable)|mature for your age|you have (?:the )?(?:prettiest|cutest|nicest|most beautiful) (?:smile|eyes|face|hair)",
    ),
  },
  { id: "money_gifts", category: "money", reason: R.money, view: "canon", pattern: w("gift ?cards?|robux|v ?bucks|i'll pay you|i will pay you|pay me|send you money|send me money|buy you (?:a|something|anything)|i'll buy you"), unless: w("pay you back|pay me back") },
  { id: "scam_codes", category: "scam", reason: R.scam, view: "canon", pattern: w("your password|send me (?:the |your )?code|verify your account|login code|free robux|free vbucks") },
];

/** Categories that suggest grooming when a tutor tries them, even once. */
export const SERIOUS_CATEGORIES: GateCategory[] = ["secrecy", "probe", "photo", "affection"];

// ---------------------------------------------------------------------------
// Views (mirrored line for line in the generated SQL)
// ---------------------------------------------------------------------------
const INVISIBLE_RE = new RegExp(INVISIBLE, "g");
const NON_ASCII_RE = new RegExp(NON_ASCII, "gu");
const MARKS_RE = new RegExp(MARKS, "g");
const SPACED_RE = new RegExp(SPACED, "g");
const DIGIT_RUN_RE = new RegExp(DIGIT_RUN, "g");
const TRAILING_RE = new RegExp(TRAILING);

function deLeet(tok: string): string {
  if (!/[a-z]/.test(tok)) return tok;
  const tail = tok.match(TRAILING_RE)?.[0] ?? "";
  return mapChars(tok.slice(0, tok.length - tail.length), LEET) + tail;
}
const NUMBER_WORD_RE = new RegExp(`\\b(?:${Object.keys(NUMBER_WORDS).join("|")})\\b`, "g");

function mapChars(s: string, map: Record<string, string>): string {
  let out = "";
  for (const ch of s) out += map[ch] ?? ch;
  return out;
}

export interface GateViews {
  base: string;
  canon: string;
  squash: string;
  digits: string;
}

export function gateViews(input: string): GateViews {
  let t = (input ?? "").normalize("NFKC").replace(INVISIBLE_RE, "");
  t = mapChars(t, HOMOGLYPHS);
  const base = t
    .normalize("NFD")
    .replace(MARKS_RE, "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(NON_ASCII_RE, " ");

  // Words: join spaced letters, undo leetspeak, drop punctuation, shorten stretched letters.
  let words = base.replace(SPACED_RE, (m) => m.replace(/[ ._*-]/g, ""));
  words = words
    .split(/\s+/)
    .map(deLeet)
    .join(" ");
  words = words.replace(/[^a-z0-9' ]+/g, " ");
  words = words.replace(/([a-z])\1{2,}/g, "$1$1").replace(/\s+/g, " ").trim();
  const canon = words
    .split(" ")
    .map((tok) => SLANG[tok] ?? tok)
    .join(" ");
  const squash = words.replace(/[^a-z]/g, "");

  // Digits: number words → digits, "555-I234" → "5551234", then each run's groups joined by "-".
  const numeric = base
    .replace(NUMBER_WORD_RE, (m) => NUMBER_WORDS[m])
    .split(/\s+/)
    .map((tok) => ((tok.match(/\d/g)?.length ?? 0) >= 3 ? tok.replace(/o/g, "0").replace(/[il]/g, "1") : tok))
    .join(" ");
  const runs = numeric.match(DIGIT_RUN_RE) ?? [];
  const digits = ` ${runs.map((r) => r.replace(/[^0-9]+/g, "-")).join(" ")} `;
  return { base, canon, squash, digits };
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------
const COMPILED = GATE_RULES.map((r) => ({
  rule: r,
  re: new RegExp(r.pattern),
  unless: r.unless ? new RegExp(r.unless) : null,
  also: r.also ? { view: r.also.view, re: new RegExp(r.also.pattern) } : null,
}));

/** The first rule the text breaks, or null. `side` is who wrote it, when known. */
export function gateCheck(text: string, side?: "tutor" | "family" | null): GateRule | null {
  if (!text) return null;
  const v = gateViews(text);
  for (const { rule, re, unless, also } of COMPILED) {
    if (rule.side && rule.side !== side) continue;
    const view = v[rule.view];
    if (!re.test(view)) continue;
    if (unless && unless.test(view)) continue;
    if (also && !also.re.test(v[also.view])) continue;
    return rule;
  }
  return null;
}
