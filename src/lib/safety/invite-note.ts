import { INVITE_NOTE_MAX } from "@/lib/constants";
import { messageViolation } from "@/lib/moderation";
import { SEVERITY_RANK, analyzeText } from "./analyze";
import type { Category } from "./lexicon";

export { INVITE_NOTE_MAX };

/**
 * A student's note goes out in an email from us to an address they typed,
 * so it gets the message filter (contact details, links, apps, swearing) and
 * the safety analyzer. The analyzer is tuned for tutor/student chat: things a
 * child normally says to a parent ("love you", "can you buy me a reed",
 * "don't tell dad, it's a surprise") are allowed; anything hurtful,
 * sexual, threatening or scammy is not.
 */
const BLOCKED: ReadonlySet<Category> = new Set(["sexual", "harassment", "threat", "hate", "scam_link", "drugs_alcohol", "profanity"]);

/** Returns why the note can't be sent, or null when it's fine. Empty notes are fine. */
export function inviteNoteProblem(note: string): string | null {
  const text = note.trim();
  if (!text) return null;
  if (text.length > INVITE_NOTE_MAX) return `Keep your note to ${INVITE_NOTE_MAX} characters.`;
  const why = messageViolation(text);
  if (why) return `Your note can’t include ${why}.`;
  const hits = analyzeText(text, "family").filter((h) => SEVERITY_RANK[h.severity] >= SEVERITY_RANK.medium);
  if (hits.some((h) => h.category === "self_harm"))
    return "This note is just for asking about lessons. If something hard is going on, please talk to a trusted adult, or call or text 988 any time.";
  if (hits.some((h) => BLOCKED.has(h.category))) return "Keep your note kind and about music lessons.";
  return null;
}
