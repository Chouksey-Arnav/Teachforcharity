/**
 * Text normalization for the safety scanner. Everything here exists to defeat
 * the tricks people use to slip past word filters, without changing meaning:
 *
 *   "Ѕnаp"        → "snap"      (Cyrillic look-alikes)
 *   "s3nd n00dz"  → "send noodz" → matched by the lexicon's "nudes" variants
 *   "s n a p"     → "snap"      (letters spaced out)
 *   "d.i.s.c.o.r.d" → "discord"
 *   "sooooo"      → "soo"       (stretched letters)
 *   zero-width characters are removed
 *
 * Pure and deterministic; no network, no models.
 */

const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ї: "i", ј: "j", ѕ: "s", ԁ: "d", ԛ: "q", ԝ: "w", ү: "y", һ: "h", ӏ: "l",
  // Greek
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ω: "w",
  // Other look-alikes
  ɡ: "g", ı: "i", ł: "l", ø: "o", ß: "ss", æ: "ae", œ: "oe",
};

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i", "|": "l", "+": "t" };

const ZERO_WIDTH = /[​-‍⁠﻿­]/g;

/** Lowercase, strip accents/zero-width chars, map look-alike letters. Keeps digits and punctuation. */
export function baseNormalize(input: string): string {
  let t = (input ?? "").normalize("NFKC").replace(ZERO_WIDTH, "").toLowerCase();
  t = t.normalize("NFD").replace(/\p{M}+/gu, "");
  let out = "";
  for (const ch of t) out += HOMOGLYPHS[ch] ?? ch;
  return out;
}

/** Leetspeak → letters, but only inside tokens that already contain a letter ("5 min" stays "5 min"). */
function deLeet(token: string): string {
  if (!/[a-z]/.test(token)) return token;
  let out = "";
  for (const ch of token) out += LEET[ch] ?? ch;
  return out;
}

/** Joins runs of 3+ single characters separated by spaces or dots: "s n a p" / "s.n.a.p" → "snap". */
function joinSpacedLetters(t: string): string {
  return t.replace(/\b(?:[a-z0-9@$][ .\-_*]){2,}[a-z0-9@$]\b/g, (m) => m.replace(/[ .\-_*]/g, ""));
}

export interface Normalized {
  /** Lowercased and cleaned, punctuation kept (for emails, links, handles). */
  base: string;
  /** Words only: evasion undone, punctuation → spaces, whitespace collapsed. */
  words: string;
  /** `words` with texting shorthand expanded. What lexicon rules and frames match against. */
  canon: string;
}

export function normalize(input: string): Normalized {
  const base = baseNormalize(input);
  let w = joinSpacedLetters(base);
  w = w
    .split(/\s+/)
    .map(deLeet)
    .join(" ");
  w = w.replace(/[’'`]/g, "'").replace(/[^a-z0-9' ]+/g, " ");
  w = w.replace(/([a-z])\1{2,}/g, "$1$1"); // "sooooo" → "soo"
  w = w.replace(/\s+/g, " ").trim();
  return { base, words: w, canon: canonicalize(w) };
}

/**
 * Texting shorthand → the words the rules are written in. Applied to whole
 * tokens of the `words` form only, so "ur" becomes "your" but "your" and
 * "tour" are untouched. Contractions ("don't", "you're") are left alone: the
 * rules and frames list both spellings.
 */
const SLANG: Record<string, string> = {
  u: "you", ya: "you", yu: "you", yah: "you", ur: "your", yur: "your", r: "are",
  rn: "right now", atm: "right now", tn: "tonight", tonite: "tonight", "2nite": "tonight", tmr: "tomorrow", tmrw: "tomorrow",
  wyd: "what are you doing", wbu: "what about you", hbu: "how about you", hmu: "hit me up", lmk: "let me know",
  pic: "picture", pics: "pictures", pix: "pictures", piccy: "picture", vid: "video", vids: "videos", selfie: "selfie",
  convo: "conversation", convos: "conversations", msg: "message", msgs: "messages", txt: "text", txts: "texts", dms: "messages",
  ig: "instagram", insta: "instagram", fb: "facebook", gc: "group chat",
  bf: "boyfriend", gf: "girlfriend", bff: "best friend", ppl: "people", pls: "please", plz: "please",
  cuz: "because", bc: "because", abt: "about", wanna: "want to", gonna: "going to", gotta: "got to",
  k: "ok", kk: "ok", okay: "ok", idk: "i don't know", nvm: "never mind", sum1: "someone", some1: "someone", ppls: "people",
  thx: "thanks", ty: "thank you", luv: "love", wat: "what", wut: "what", dat: "that", da: "the", n: "and", w: "with",
  b4: "before", l8r: "later", gr8: "great", sry: "sorry", srsly: "seriously", tbh: "to be honest", ngl: "not going to lie",
  im: "i'm", ive: "i've", youre: "you're", dont: "don't", doesnt: "doesn't", didnt: "didn't",
  cant: "can't", wont: "won't", wouldnt: "wouldn't", shouldnt: "shouldn't", isnt: "isn't", arent: "aren't", wasnt: "wasn't",
  whats: "what's", thats: "that's", lets: "let's", hes: "he's", shes: "she's", theyre: "they're",
};

/** `words` with shorthand expanded (see SLANG). What rules and frames match against. */
export function canonicalize(words: string): string {
  return words
    .split(" ")
    .map((t) => SLANG[t] ?? t)
    .join(" ");
}

/**
 * Splits text into clauses at sentence punctuation, line breaks and a few
 * clause-joining words, so "meet me in the lesson link. then come over" is two
 * clauses and context in one doesn't excuse the other. Works on raw text.
 */
export function clauses(input: string): string[] {
  return (input ?? "")
    .split(/[.!?;\n\r]+|,\s+(?=(?:but|and then|then|so|also)\b)|\s+-\s+|\s+—\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Word tokens with their start offsets in `words` (for negation look-behind). */
export function tokenize(words: string): { token: string; start: number }[] {
  const out: { token: string; start: number }[] = [];
  const re = /[a-z0-9']+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(words))) out.push({ token: m[0], start: m.index });
  return out;
}
