/**
 * Accepts the ways people paste a Meet link ("meet.google.com/abc-defg-hij",
 * "https://meet.google.com/abc-defg-hij?authuser=0", or just "abc-defg-hij")
 * and returns the canonical https URL, or null if it isn't a Meet meeting code.
 */
export function normalizeMeetUrl(input: string): string | null {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  const code = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
  if (code.test(raw)) return `https://meet.google.com/${raw}`;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.hostname !== "meet.google.com") return null;
  const path = url.pathname.replace(/^\/+|\/+$/g, "");
  return code.test(path) ? `https://meet.google.com/${path}` : null;
}
