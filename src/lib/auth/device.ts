/** A short, human label for a browser user-agent, e.g. "Chrome on Windows". Never the raw string. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown device";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /CrOS/.test(ua)
          ? "Chromebook"
          : /Windows/.test(ua)
            ? "Windows"
            : /Mac OS X|Macintosh/.test(ua)
              ? "Mac"
              : /Linux/.test(ua)
                ? "Linux"
                : "an unknown system";
  // Order matters: Edge and Opera also say "Chrome"; Chrome also says "Safari".
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "A browser";
  return `${browser} on ${os}`;
}

export const DEVICE_COOKIE = "tfac_device";
