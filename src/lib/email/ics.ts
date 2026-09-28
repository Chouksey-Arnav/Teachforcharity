/** Minimal RFC 5545 calendar invite for booked lessons (one VEVENT per lesson). */
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
/** Escapes a TEXT value: backslash, semicolon, comma and newlines (RFC 5545 §3.3.11). */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export interface IcsEvent {
  uid: string;
  start: string;
  end: string;
}

export function buildIcs(opts: {
  /** One lesson, or every lesson in a weekly series. */
  events: IcsEvent[];
  summary: string;
  description: string;
  /** A URL (the Lessons page): lessons have no fixed location, and the Meet link is never put in invites. */
  location: string;
  method?: "PUBLISH" | "CANCEL";
}): string {
  const stamp = icsDate(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Teach for a Cause//Lessons//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.method ?? "PUBLISH"}`,
    ...opts.events.flatMap((e) => [
      "BEGIN:VEVENT",
      `UID:${e.uid}@teachforacause`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${icsText(opts.summary)}`,
      `DESCRIPTION:${icsText(opts.description)}`,
      `LOCATION:${icsText(opts.location)}`,
      `URL:${opts.location}`,
      opts.method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Lesson in 30 minutes",
      "END:VALARM",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
