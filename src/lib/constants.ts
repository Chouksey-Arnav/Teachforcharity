export const LEVELS = ["beginner", "developing", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_INFO: Record<Level, { label: string; student: string; short: string }> = {
  beginner: {
    label: "Beginner",
    short: "Just starting",
    student: "Less than a year. Still learning notes, rhythms, and how to make a steady sound.",
  },
  developing: {
    label: "Developing",
    short: "Getting comfortable",
    student: "Plays in school band or orchestra and can read most music, but some parts are still hard.",
  },
  intermediate: {
    label: "Intermediate",
    short: "Confident player",
    student: "Comfortable with most school music. Working on range, tone, and tougher pieces.",
  },
  advanced: {
    label: "Advanced",
    short: "Ready for more",
    student: "Preparing for auditions like All-District, or playing well beyond the school level.",
  },
};

export const DAYS = [
  { key: "mon", label: "Mon", long: "Monday" },
  { key: "tue", label: "Tue", long: "Tuesday" },
  { key: "wed", label: "Wed", long: "Wednesday" },
  { key: "thu", label: "Thu", long: "Thursday" },
  { key: "fri", label: "Fri", long: "Friday" },
  { key: "sat", label: "Sat", long: "Saturday" },
  { key: "sun", label: "Sun", long: "Sunday" },
] as const;

export const BLOCKS = [
  { key: "morning", label: "Morning", range: "9–12", start: 9 * 60, end: 12 * 60 },
  { key: "midday", label: "Midday", range: "12–3", start: 12 * 60, end: 15 * 60 },
  { key: "afternoon", label: "After school", range: "3–5", start: 15 * 60, end: 17 * 60 },
  { key: "early_evening", label: "Early evening", range: "5–7", start: 17 * 60, end: 19 * 60 },
  { key: "evening", label: "Evening", range: "7–9", start: 19 * 60, end: 21 * 60 },
] as const;

export type DayKey = (typeof DAYS)[number]["key"];
export type BlockKey = (typeof BLOCKS)[number]["key"];
export type SlotKey = `${DayKey}_${BlockKey}`;

export const ALL_SLOTS: SlotKey[] = DAYS.flatMap((d) => BLOCKS.map((b) => `${d.key}_${b.key}` as SlotKey));

export function slotLabel(slot: string): string {
  const [day, ...rest] = slot.split("_");
  const block = rest.join("_");
  const d = DAYS.find((x) => x.key === day);
  const b = BLOCKS.find((x) => x.key === block);
  return d && b ? `${d.label} ${b.label.toLowerCase()}` : slot;
}

/** Goals students pick (max 3) and strengths tutors pick — same vocabulary so they can be matched. */
export const GOALS = [
  { key: "fundamentals", label: "Strong fundamentals", hint: "Tone, posture, breathing or bowing" },
  { key: "reading", label: "Reading music", hint: "Notes, rhythms, sight-reading" },
  { key: "school_music", label: "Keeping up in band/orchestra", hint: "Help with concert music" },
  { key: "audition_prep", label: "Audition prep", hint: "All-District, All-County, chair tests" },
  { key: "technique", label: "Range & technique", hint: "Scales, speed, high notes, shifting" },
  { key: "theory", label: "Music theory", hint: "Scales, keys, how music works" },
  { key: "jazz", label: "Jazz & improvising", hint: "Swing, chords, soloing" },
  { key: "confidence", label: "Confidence & fun", hint: "Enjoying music, playing for others" },
] as const;
export type GoalKey = (typeof GOALS)[number]["key"];
export const goalLabel = (k: string) => GOALS.find((g) => g.key === k)?.label ?? k;

/** Music students and tutors enjoy (max 6 each) — used as a matching signal. Keys must match ^[a-z_]{2,30}$. */
export const INTERESTS = [
  { key: "classical", label: "Classical" },
  { key: "film_music", label: "Movie & game music" },
  { key: "pop", label: "Pop hits" },
  { key: "jazz_music", label: "Jazz" },
  { key: "rock", label: "Rock" },
  { key: "marching_band", label: "Marching band" },
  { key: "musicals", label: "Musicals & Broadway" },
  { key: "anime_music", label: "Anime music" },
  { key: "latin", label: "Latin" },
  { key: "hip_hop", label: "Hip-hop & R&B" },
  { key: "gospel", label: "Gospel & church music" },
  { key: "country", label: "Country & bluegrass" },
  { key: "composing", label: "Writing my own music" },
  { key: "chamber", label: "Small groups & duets" },
] as const;
export type InterestKey = (typeof INTERESTS)[number]["key"];
export const interestLabel = (k: string) => INTERESTS.find((i) => i.key === k)?.label ?? k;

export const TEACHING_STYLES = [
  { key: "structured", label: "A clear plan every lesson", tutor: "I like a clear plan and routine each lesson" },
  { key: "flexible", label: "Go with what I need that day", tutor: "I adjust each lesson to what the student brings" },
  { key: "balanced", label: "A bit of both", tutor: "A bit of both" },
] as const;

export const EXPLAIN_STYLES = [
  { key: "show", label: "Show me — I learn by watching and copying", tutor: "Mostly by demonstrating on my instrument" },
  { key: "tell", label: "Tell me — I like to understand why", tutor: "Mostly by explaining the why" },
  { key: "balanced", label: "Both work for me", tutor: "Both, depending on the student" },
] as const;

export const ENSEMBLES = [
  { key: "school", label: "School band or orchestra" },
  { key: "top_school", label: "Top school ensemble (Wind Ensemble, Symphonic, etc.)" },
  { key: "all_district", label: "All-District / All-County" },
  { key: "all_state", label: "All-State" },
  { key: "youth_orchestra", label: "Youth orchestra / wind ensemble" },
] as const;
export const ensembleLabel = (k: string) => ENSEMBLES.find((e) => e.key === k)?.label ?? k;

export const INSTRUMENT_FAMILIES = [
  { key: "woodwind", label: "Woodwinds" },
  { key: "brass", label: "Brass" },
  { key: "percussion", label: "Percussion" },
  { key: "strings", label: "Strings" },
  { key: "keyboard", label: "Keyboard" },
  { key: "other", label: "Other" },
] as const;

export const DURATIONS = [30, 45, 60] as const;

export const INCIDENT_CATEGORIES = [
  { key: "safety", label: "Safety concern", hint: "Anything that made you or your child feel unsafe. Pauses the tutor while we review." },
  { key: "conduct", label: "Inappropriate behavior", hint: "Rude, unprofessional, or off-topic conduct." },
  { key: "no_show", label: "Missed lesson", hint: "Someone didn't show up." },
  { key: "technical", label: "Technical problem", hint: "Something on the site isn't working." },
  { key: "other", label: "Something else", hint: "" },
] as const;

export const NC_COUNTIES = [
  "Alamance", "Alexander", "Alleghany", "Anson", "Ashe", "Avery", "Beaufort", "Bertie", "Bladen", "Brunswick",
  "Buncombe", "Burke", "Cabarrus", "Caldwell", "Camden", "Carteret", "Caswell", "Catawba", "Chatham", "Cherokee",
  "Chowan", "Clay", "Cleveland", "Columbus", "Craven", "Cumberland", "Currituck", "Dare", "Davidson", "Davie",
  "Duplin", "Durham", "Edgecombe", "Forsyth", "Franklin", "Gaston", "Gates", "Graham", "Granville", "Greene",
  "Guilford", "Halifax", "Harnett", "Haywood", "Henderson", "Hertford", "Hoke", "Hyde", "Iredell", "Jackson",
  "Johnston", "Jones", "Lee", "Lenoir", "Lincoln", "Macon", "Madison", "Martin", "McDowell", "Mecklenburg",
  "Mitchell", "Montgomery", "Moore", "Nash", "New Hanover", "Northampton", "Onslow", "Orange", "Pamlico",
  "Pasquotank", "Pender", "Perquimans", "Person", "Pitt", "Polk", "Randolph", "Richmond", "Robeson", "Rockingham",
  "Rowan", "Rutherford", "Sampson", "Scotland", "Stanly", "Stokes", "Surry", "Swain", "Transylvania", "Tyrrell",
  "Union", "Vance", "Wake", "Warren", "Washington", "Watauga", "Wayne", "Wilkes", "Wilson", "Yadkin", "Yancey",
] as const;

export const SESSION_STATUS_LABEL: Record<string, string> = {
  pending: "Requested",
  scheduled: "Booked",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  completed: "Awaiting family confirmation",
  confirmed: "Confirmed · awaiting verification",
  disputed: "Under review",
  verified: "Verified",
  rejected: "Not verified",
};
