/**
 * Semantic frames: meaning built from concepts that appear near each other in
 * one clause, instead of exact phrases. One frame covers dozens of wordings:
 *
 *   secrecy = NEGATION governing a DISCLOSE verb, with a THIRD PARTY nearby
 *     "don't tell your mom" · "your mom doesn't need to know"
 *     "no need to mention our chats to your mom" · "let's not bring this up with your parents"
 *     "probably best your dad doesn't hear about this" · "nobody else has to find out"
 *
 * Concepts are lists of phrases matched as whole tokens of the canonical form
 * (see normalize.ts), so "ur mom dont need 2 kno" works too. Pure and fast.
 */
import type { Category } from "./lexicon";
import type { Side } from "./analyze";

type Phrase = string[];
const P = (...xs: string[]): Phrase[] => xs.map((x) => x.split(" "));

const YOUR_PEOPLE = ["your mom", "your mum", "your mother", "your dad", "your father", "your parents", "your parent", "your family", "your folks",
  "your guardian", "your guardians", "your brother", "your sister", "your siblings", "your teacher", "your teachers", "your band director",
  "your director", "your friends", "your stepmom", "your stepdad", "your grandma", "your grandpa"];

const C = {
  /** Negation that governs a telling verb: "don't tell", "no need to mention", "let's not bring up". */
  NEG: P("don't", "do not", "never", "no need to", "not need to", "need not", "shouldn't", "should not", "better not", "won't", "will not", "let's not",
    "lets not", "no reason to", "not allowed to", "don't need to", "do not need to", "don't have to", "do not have to"),
  /** The tutor promising to keep the child's secrets. Adults shouldn't; it's a review item, not proof. */
  PROMISE: P("i won't", "i will not", "i'll never", "i will never", "i wont", "i promise not to", "i promise i won't"),
  /** Negation + modal on a knowing verb: "doesn't need to know", "can't find out", "won't hear". Plain "doesn't know" is just a fact. */
  NEG_MODAL: P("doesn't need to", "does not need to", "don't need to", "do not need to", "doesn't have to", "does not have to", "don't have to",
    "do not have to", "never needs to", "never has to", "never have to", "shouldn't", "should not", "can't", "cannot", "mustn't", "must not",
    "won't", "will not", "better not", "doesn't ever need to"),
  /** Any negation, for "it's best if your dad doesn't hear". */
  NEG_ANY: P("doesn't", "does not", "don't", "do not", "never", "won't", "can't", "shouldn't", "didn't"),
  /** "it's best / better if …" turns a plain negation into advice to hide something. */
  BEST: P("best if", "better if", "best that", "better that", "probably best", "best", "better", "safer if", "easier if"),
  /** Negation where the third party is the subject: "nobody (else) has to find out". */
  NOBODY: P("nobody has to", "no one has to", "nobody needs to", "no one needs to", "nobody else has to", "no one else has to", "nobody else needs to",
    "no one else needs to", "nobody should", "no one should", "nobody else should", "no one else should", "nobody will", "no one will", "nobody else will",
    "no one else will", "nobody would", "no one would", "nobody ever has to", "no one ever has to"),
  /** "don't let your mom see": the third party sits between "let" and the knowing verb. */
  DONT_LET: P("don't let", "do not let", "never let", "dont let", "better not let", "won't let"),
  TELL: P("tell", "mention", "say anything", "show", "share", "bring this up", "bring it up", "bring that up", "bring up", "talk about this", "talk about it",
    "talk about us", "let on", "tell on"),
  KNOW: P("know", "find out", "hear", "hear about", "see", "read", "look at", "look through", "notice", "learn about", "catch"),
  /** Who a telling verb's message would reach. */
  RECIPIENT: P(...YOUR_PEOPLE, "anyone", "anybody", "anyone else", "anybody else", "no one", "nobody"),
  /** Whose knowing would be the problem. Only someone close to the child. */
  WATCHER: P(...YOUR_PEOPLE),
  /** Reassurance that parents are in the loop. A clause with this isn't secrecy. */
  OPEN: P("can see", "can read", "can join", "are welcome", "is welcome", "always see", "will see", "sit in", "copied", "in the loop", "loop them in",
    "can always", "are invited", "is invited", "let them know", "please tell", "make sure to tell", "feel free to tell"),
  KEEP: P("keep", "keeping", "leave", "stays", "stay"),
  PRIVATE: P("private", "secret", "a secret", "to yourself", "to ourselves", "between us", "between the two of us", "between you and me",
    "on the down low", "on the dl", "hush hush", "just ours", "just for us", "off the record"),
  RELATION: P("this conversation", "this chat", "our conversation", "our conversations", "our chat", "our chats", "our talks",
    "our messages", "these messages", "us", "what we talk about", "what we say", "our lessons", "the extra lessons", "this convo", "our convo"),
  /** A bare "this/it": could be the chat or the bar of music. Only a review item. */
  REFERENT: P("this", "it", "that", "things"),
  /** Grownups who supposedly don't get the child. */
  ADULTS: P(...YOUR_PEOPLE, "other adults", "other people", "nobody else", "no one else", "other teachers", "she", "he", "they", "she probably",
    "he probably", "they probably"),
  NOT_GET: P("wouldn't understand", "won't understand", "don't understand", "doesn't understand", "would never understand", "will never understand",
    "can't understand", "wouldn't get it", "won't get it", "don't get it", "doesn't get it", "don't get you", "doesn't get you", "wouldn't get you",
    "don't really get you", "doesn't really get you", "would just overreact", "would overreact", "would freak out", "would just freak out", "won't listen",
    "would get mad", "would be mad", "don't care about you", "doesn't care about you", "wouldn't get why", "won't get why",
    "wouldn't understand why", "probably wouldn't get", "wouldn't really get", "doesn't get why", "don't get why"),
  /** A student reporting what someone else asked of them. */
  REPORTER: P("he", "she", "they", "my tutor", "the tutor", "my teacher", "someone", "this guy", "this person", "this girl"),
  ASKED: P("told me not to", "told me to", "asked me to", "asks me to", "asked me for", "asks me for", "keeps asking me", "kept asking me", "keeps asking me for",
    "keeps asking me to", "wants me to", "wanted me to", "made me", "makes me", "tried to get me to", "is making me", "said not to", "said i shouldn't",
    "said to", "keeps telling me to", "keeps telling me not to"),
  ASK_WHAT: P("pictures", "photos", "selfies", "nudes", "a picture", "a photo", "a selfie", "secret", "a secret", "not tell", "tell my mom", "tell my dad",
    "tell my parents", "tell anyone", "tell anybody", "tell my mum", "tell my family", "delete", "meet", "meet up", "come over", "facetime", "video chat",
    "touch", "lie", "keep it secret", "keep this secret"),
} as const;

export type Concept = keyof typeof C;

export interface Frame {
  id: string;
  category: Category;
  weight: number;
  precise?: boolean;
  why: string;
  /** Only for messages from this side (a tutor isolating a student; a student disclosing). */
  from?: Side;
  /** Every slot must be found, with at most `window` other tokens in between them (phrase lengths don't count). */
  slots: Concept[];
  window: number;
  /** [a, b, maxGap]: slot a ends before slot b starts, with at most maxGap tokens between them. */
  order?: [number, number, number][];
  /** If any phrase of these concepts is in the clause, the frame doesn't fire. */
  unless?: Concept[];
}

export const FRAMES: Frame[] = [
  // "don't tell your mom" · "no need to mention our chats to your mom" · "let's not bring this up with your parents"
  { id: "fr_secrecy_tell", category: "grooming_secrecy", weight: 9, precise: true, why: "asks the student not to tell their parents or anyone else",
    slots: ["NEG", "TELL", "RECIPIENT"], window: 8, order: [[0, 1, 2], [1, 2, 6]], unless: ["OPEN"] },
  // "I won't tell your parents" — a promise of secrecy. Reviewed by a person; never automatic.
  { id: "fr_promise_secrecy", category: "grooming_secrecy", weight: 6, from: "tutor", why: "promises the student to keep things from their parents",
    slots: ["PROMISE", "TELL", "RECIPIENT"], window: 7, order: [[0, 1, 1], [1, 2, 5]], unless: ["OPEN"] },
  // "your mom doesn't need to know" · "your parents can't find out" · "your dad won't hear about it"
  { id: "fr_secrecy_know", category: "grooming_secrecy", weight: 9, precise: true, why: "says the student's parents shouldn't find out",
    slots: ["WATCHER", "NEG_MODAL", "KNOW"], window: 3, order: [[0, 1, 1], [1, 2, 1]], unless: ["OPEN"] },
  // "probably best your dad doesn't hear about this"
  { id: "fr_secrecy_best", category: "grooming_secrecy", weight: 8, precise: true, why: "suggests it's best the parents don't find out",
    slots: ["BEST", "WATCHER", "NEG_ANY", "KNOW"], window: 5, order: [[0, 1, 2], [1, 2, 1], [2, 3, 1]], unless: ["OPEN"] },
  // "nobody else has to find out about us" · "no one needs to know"
  { id: "fr_secrecy_nobody", category: "grooming_secrecy", weight: 9, precise: true, why: "says nobody else needs to find out",
    slots: ["NOBODY", "KNOW"], window: 2, order: [[0, 1, 1]], unless: ["OPEN"] },
  // "don't let your parents see this"
  { id: "fr_secrecy_let", category: "grooming_secrecy", weight: 9, precise: true, why: "asks the student not to let their parents see",
    slots: ["DONT_LET", "WATCHER", "KNOW"], window: 3, order: [[0, 1, 0], [1, 2, 1]], unless: ["OPEN"] },
  // "keep this convo private" · "keep our talks to yourself"
  { id: "fr_keep_private", category: "grooming_secrecy", weight: 8, precise: true, why: "asks to keep the conversation private",
    slots: ["KEEP", "RELATION", "PRIVATE"], window: 3, order: [[0, 1, 0], [1, 2, 2]] },
  // "keep this private": the referent is ambiguous ("keep it secret what the surprise piece is"), so a person decides.
  { id: "fr_keep_vague", category: "grooming_secrecy", weight: 6, why: "asks to keep something private",
    slots: ["KEEP", "REFERENT", "PRIVATE"], window: 2, order: [[0, 1, 0], [1, 2, 1]] },
  // "your parents wouldn't understand" · "your mom would just overreact"
  { id: "fr_isolation", category: "isolation", weight: 6, from: "tutor", why: "tells the student their family or friends wouldn't understand",
    slots: ["ADULTS", "NOT_GET"], window: 3, order: [[0, 1, 2]] },
  // "he keeps asking me for pictures" · "he told me not to tell my mom"
  { id: "fr_disclosure", category: "disclosure", weight: 8, from: "family", why: "the student reports someone asking for pictures, secrets or meetups",
    slots: ["REPORTER", "ASKED", "ASK_WHAT"], window: 7, order: [[0, 1, 2], [1, 2, 4]] },
];

/** Each concept's phrases indexed by first word, so matching a clause is one pass over its tokens. */
const INDEX = new Map<Concept, Map<string, Phrase[]>>(
  (Object.keys(C) as Concept[]).map((c) => {
    const byFirst = new Map<string, Phrase[]>();
    for (const ph of C[c]) byFirst.set(ph[0], [...(byFirst.get(ph[0]) ?? []), ph]);
    return [c, byFirst];
  }),
);

/** Every [start, end) token span where one of the concept's phrases occurs in `tokens`. */
function spans(tokens: string[], concept: Concept): [number, number][] {
  const byFirst = INDEX.get(concept)!;
  const out: [number, number][] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const ph of byFirst.get(tokens[i]) ?? []) {
      if (i + ph.length > tokens.length) continue;
      let ok = true;
      for (let k = 1; k < ph.length; k++) if (tokens[i + k] !== ph[k]) { ok = false; break; }
      if (ok) out.push([i, i + ph.length]);
    }
  }
  return out;
}

export interface FrameMatch {
  frame: Frame;
  match: string;
}

/** Frames that fire in one clause (`tokens` = the clause's canonical tokens). `side` unknown = every frame. */
export function matchFrames(tokens: string[], side?: Side): FrameMatch[] {
  const out: FrameMatch[] = [];
  const cache = new Map<Concept, [number, number][]>();
  const find = (c: Concept) => {
    let s = cache.get(c);
    if (!s) cache.set(c, (s = spans(tokens, c)));
    return s;
  };
  for (const frame of FRAMES) {
    if (frame.from && side && frame.from !== side) continue;
    if (frame.unless?.some((c) => find(c).length)) continue;
    const options = frame.slots.map(find);
    if (options.some((o) => !o.length)) continue;
    const hit = search(options, frame, []);
    if (hit) {
      const lo = Math.min(...hit.map((s) => s[0]));
      const hi = Math.max(...hit.map((s) => s[1]));
      out.push({ frame, match: tokens.slice(lo, hi).join(" ").slice(0, 80) });
    }
  }
  return out;
}

/** Depth-first search for one span per slot: non-overlapping, inside the window, respecting `governs`. */
function search(options: [number, number][][], frame: Frame, picked: [number, number][]): [number, number][] | null {
  if (picked.length === options.length) {
    const lo = Math.min(...picked.map((s) => s[0]));
    const hi = Math.max(...picked.map((s) => s[1]));
    const covered = picked.reduce((n, sp) => n + (sp[1] - sp[0]), 0);
    if (hi - lo - covered > frame.window) return null;
    for (const [a, b, gap] of frame.order ?? []) {
      const between = picked[b][0] - picked[a][1];
      if (between < 0 || between > gap) return null;
    }
    return picked;
  }
  for (const s of options[picked.length]) {
    if (picked.some((p) => s[0] < p[1] && p[0] < s[1])) continue;
    const r = search(options, frame, [...picked, s]);
    if (r) return r;
  }
  return null;
}
