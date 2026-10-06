/**
 * Word lists and small text models used by the tutor account check. Kept apart
 * from pipeline.ts so the rules can be read and tuned on their own.
 *
 * Everything matches against normalize()'d text (see ../safety/normalize.ts):
 * lowercased, look-alike letters mapped, leetspeak and spaced-out letters undone.
 */

/** Words that show a bio is about music teaching. One hit is enough. */
export const MUSIC_TERMS = new Set([
  "music", "musical", "musician", "instrument", "instruments", "play", "plays", "playing", "played", "practice", "practicing",
  "lesson", "lessons", "teach", "teaching", "tutor", "tutoring", "band", "orchestra", "ensemble", "jazz", "marching",
  "concert", "symphony", "chamber", "choir", "section", "chair", "solo", "scales", "scale", "rhythm", "tone", "tuning",
  "sight", "reading", "notes", "note", "sheet", "theory", "audition", "auditions", "allstate", "all", "district", "regional",
  "violin", "viola", "cello", "bass", "flute", "piccolo", "clarinet", "oboe", "bassoon", "saxophone", "sax", "trumpet",
  "trombone", "horn", "french", "euphonium", "baritone", "tuba", "percussion", "drums", "snare", "mallets", "marimba",
  "xylophone", "timpani", "piano", "guitar", "harp", "strings", "brass", "woodwind", "woodwinds", "bow", "embouchure",
  "reed", "reeds", "valve", "valves", "slide", "metronome", "tempo", "dynamics", "articulation", "vibrato", "etude", "etudes",
]);

/** The most common English function words. A real sentence is full of them; keyboard mash isn't. */
export const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "i", "i'm", "im", "me", "my", "we", "you", "your", "it", "its", "is", "am", "are",
  "was", "were", "be", "been", "have", "has", "had", "do", "does", "did", "to", "of", "in", "on", "at", "for", "with",
  "from", "by", "about", "as", "that", "this", "these", "those", "so", "if", "then", "than", "when", "what", "who", "how",
  "can", "will", "would", "like", "love", "also", "too", "very", "really", "just", "not", "no", "all", "some", "more",
  "since", "into", "up", "out", "there", "here", "they", "them", "their", "he", "she", "him", "her", "our", "us", "years",
]);

/** Names people type when they don't want to give a real one. */
export const PLACEHOLDER_NAMES = new Set([
  "test", "tester", "testing", "user", "admin", "tutor", "teacher", "student", "parent", "guardian", "mom", "dad",
  "name", "first", "last", "firstname", "lastname", "none", "null", "undefined", "anonymous", "anon", "unknown",
  "asdf", "qwerty", "john doe", "jane doe", "foo", "bar", "abc", "xyz", "no name", "n/a", "na",
]);

const KEYBOARD_RUNS = ["qwer", "wert", "asdf", "sdfg", "dfgh", "fghj", "ghjk", "hjkl", "zxcv", "xcvb", "cvbn", "vbnm", "uiop", "1234"];

/** Words that make a school name look like a school. Missing it is only a soft signal. */
export const SCHOOL_WORDS = /\b(?:high|hs|school|academy|prep|preparatory|early college|college|institute|christian|catholic|montessori|homeschool|home school|virtual|charter|magnet|stem|arts|international|secondary|ib)\b/;

/**
 * Tutoring here is free. Any sign of selling lessons is a problem for the
 * program's legal footing, so these are a fail, not a warning.
 */
export const COMMERCIAL = /\$\s?\d|\b\d+\s?(?:dollars|bucks)\b|\bper (?:hour|hr|lesson|session)\b|\b(?:my|lesson|hourly) rates?\b|\bpaid (?:lessons?|tutoring)\b|\bhire me\b|\bi charge\b|\bdiscounts?\b|\bvenmo\b|\bcash ?app\b|\bzelle\b|\bpaypal\b/;

/**
 * "I'm 24" / "24 years old". Numbers followed by a unit ("I'm 20 minutes away",
 * "I've played 8 years") aren't ages.
 */
const AGE_PATTERNS = [
  /\b(?:i'?m|i am|im)\s+(\d{1,2})(?![\d%])(?!\s*(?:years?|yrs?|minutes?|mins?|hours?|hrs?|percent|th|st|nd|rd|times?|days?|weeks?|months?|instruments?|songs?|pieces?|\/))/,
  /\b(\d{1,2})\s*(?:years?|yrs?)[\s-]*old\b/,
];

/** Ages stated in free text, in the order they appear. */
export function statedAges(base: string): number[] {
  const out: number[] = [];
  for (const re of AGE_PATTERNS) {
    for (const m of base.matchAll(new RegExp(re.source, "g"))) out.push(Number(m[1]));
  }
  return out;
}

/**
 * A student telling a tutor to stop, or saying something felt wrong. In a
 * grooming case the child's discomfort is often the clearest signal there is,
 * so it's checked on the family side of every conversation.
 */
export const DISCOMFORT = [
  { id: "ds_uncomfortable", pattern: /\b(?:(?:you|u|this|that|it) (?:make|makes|made|making) me (?:feel )?(?:uncomfortable|scared|weird|nervous|unsafe)|(?:i'?m|i am|im|i feel) (?:really |so |kind of )?(?:uncomfortable|scared of you|unsafe))\b/ },
  { id: "ds_stop", pattern: /\b(?:stop (?:messaging|texting|asking|talking to|calling) me|leave me alone|please stop|don'?t (?:message|text|talk to) me)\b/ },
  { id: "ds_creepy", pattern: /\b(?:(?:that'?s|thats|you'?re|youre|ur|this is) (?:so |really |kind of )?(?:creepy|weird|gross|inappropriate))\b/ },
  { id: "ds_not_allowed", pattern: /\b(?:my (?:mom|dad|parents?|mother|father) (?:said|says) (?:no|i can'?t|not to)|i'?m not (?:allowed|supposed) to)\b/ },
];

/**
 * True if a single word looks like keyboard mash rather than a name:
 * no vowels, a very long consonant run, a tripled letter, or a keyboard row.
 */
export function looksLikeMash(word: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length < 4) return false;
  // Real surnames can be vowel-light ("Strand", "Schmidt"), so only no vowels at all counts.
  if (!/[aeiouy]/.test(w)) return true;
  if (/[^aeiouy]{6,}/.test(w)) return true;
  if (/(.)\1\1/.test(w)) return true;
  return KEYBOARD_RUNS.some((r) => w.includes(r));
}

/**
 * Lowercased address with the parts that don't change the mailbox removed:
 * "+tags" everywhere, and dots in Gmail usernames. Two addresses with the
 * same canonical form deliver to the same inbox.
 */
export function canonicalEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at).split("+")[0];
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** Letters only, single spaces: for comparing names typed slightly differently. */
export const nameKey = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
