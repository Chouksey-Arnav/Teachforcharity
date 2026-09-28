/**
 * Only allow same-site relative redirects. Blocks open redirects such as
 * //evil.com, /\evil.com and /<tab>/evil.com (browsers and the URL parser
 * strip tabs and newlines, and treat \ as /, before reading the host).
 */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  const n = typeof next === "string" ? next : "";
  if (!n.startsWith("/") || n.startsWith("//")) return fallback;
  // No backslashes or control characters anywhere in the path.
  if (/[\\\u0000-\u001f\u007f]/.test(n)) return fallback;
  return n;
}
