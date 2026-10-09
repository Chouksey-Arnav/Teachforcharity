/**
 * What a message (or any note another person will read) can't contain.
 * The rules live in src/lib/safety/gate.ts and are mirrored exactly by
 * private.gate_check() in the database, which is the real gate; this copy
 * gives instant feedback while typing.
 */
import { GATE_RULES, gateCheck } from "./safety/gate";

export type Author = "tutor" | "family";

/** Why `text` can't be sent ("phone numbers", …), or null. Pass who wrote it when known. */
export function messageViolation(text: string, side?: Author | null): string | null {
  return gateCheck(text ?? "", side)?.reason ?? null;
}

// Plain (undisguised) matches can be found in the lowercased text itself, so they can be pointed at.
const SPAN_RULES = GATE_RULES.filter((r) => (r.view === "base" || r.view === "canon") && !r.side && !r.also).map((r) => ({
  reason: r.reason,
  re: new RegExp(r.pattern, "g"),
  unless: r.unless ? new RegExp(r.unless) : null,
}));

/**
 * The spans of `text` to highlight as blocked, in order and without overlaps,
 * for the public site's demo. Disguised text ("ѕnаp", "s n a p") is caught by
 * the gate but can't be pointed at character by character; then the whole
 * text is one span. Never decides anything on its own: a span exists exactly
 * when messageViolation() returns a reason.
 */
export function violationSpans(text: string): { start: number; end: number; reason: string }[] {
  const raw = text ?? "";
  const reason = messageViolation(raw);
  if (!reason) return [];
  const t = raw.toLowerCase();
  const whole = [{ start: 0, end: raw.length, reason }];
  // toLowerCase() can change the length of a few characters (e.g. "İ"); then indexes no longer line up.
  if (t.length !== raw.length) return whole;
  const found: { start: number; end: number; reason: string }[] = [];
  for (const rule of SPAN_RULES) {
    if (rule.unless?.test(t)) continue;
    for (const m of t.matchAll(rule.re)) {
      if (!m[0]) continue;
      // Patterns like /(^|\s)@handle/ include the leading space; highlight only the handle.
      const lead = m[0].length - m[0].trimStart().length;
      found.push({ start: m.index + lead, end: m.index + m[0].length, reason: rule.reason });
    }
  }
  if (!found.length) return whole;
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
