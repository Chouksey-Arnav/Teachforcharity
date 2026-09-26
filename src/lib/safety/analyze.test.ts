import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { analyzeText, flagsForConversation, flagsForMessage, policy, severityFor, type ScanMessage } from "./analyze";
import { normalize } from "./normalize";

const cats = (t: string) => analyzeText(t).map((h) => h.category);
const top = (t: string) => analyzeText(t)[0];
const msg = (body: string, side: "tutor" | "family" = "tutor", at = "2026-09-20T20:00:00Z", id = Math.random().toString(36).slice(2)): ScanMessage => ({
  id,
  thread_id: "th1",
  sender_id: side === "tutor" ? "tutor-1" : "family-1",
  sender_side: side,
  body,
  created_at: at,
});

describe("normalize — defeats evasion", () => {
  it("maps Cyrillic look-alikes", () => expect(normalize("Ѕnаpсhаt").words).toBe("snapchat"));
  it("undoes leetspeak inside words only", () => {
    expect(normalize("s3nd n00dz").words).toBe("send noodz");
    expect(normalize("practice 5 minutes").words).toBe("practice 5 minutes");
  });
  it("joins spaced-out letters", () => expect(normalize("add me on d i s c o r d").words).toBe("add me on discord"));
  it("joins dotted letters", () => expect(normalize("my s.n.a.p is").words).toBe("my snap is"));
  it("strips zero-width characters", () => expect(normalize("dis​cord").words).toBe("discord"));
  it("shortens stretched letters", () => expect(normalize("sooooo good").words).toBe("soo good"));
  it("strips accents", () => expect(normalize("nüdes").words).toBe("nudes"));
});

describe("must flag", () => {
  const cases: [string, string, ("low" | "medium" | "high" | "critical")?][] = [
    ["don't tell your parents about our lessons", "grooming_secrecy", "critical"],
    ["this is our little secret ok", "grooming_secrecy", "high"],
    ["delete these messages after you read them", "grooming_secrecy", "high"],
    ["are you home alone right now", "personal_probe", "high"],
    ["where do you live?", "personal_probe", "medium"],
    ["send me a pic of you in bed", "sexual", "critical"],
    ["s3nd n00dz", "sexual", "critical"],
    ["what are you wearing", "sexual", "high"],
    ["you're so hot", "sexual", "high"],
    ["we should meet up at the park saturday", "meeting", "high"],
    ["I can pick you up after school", "meeting", "high"],
    ["text me at 919 555 0199", "contact_migration", "high"],
    ["add me on d i s c o r d", "contact_migration"],
    ["whats your snap", "contact_migration"],
    ["my email is leo dot smith at gmail dot com", "contact_migration"],
    ["nine one nine five five five zero one nine nine", "contact_migration", "high"],
    ["I'll get you a gift card if you practice", "gifts_money"],
    ["click this link for free robux", "scam_link", "high"],
    ["check out bit.ly/abc123", "scam_link", "high"],
    ["what's your password", "scam_link", "high"],
    ["I want to kill myself", "self_harm", "critical"],
    ["i wanna die", "self_harm", "critical"],
    ["i've been cutting my arms", "self_harm", "critical"],
    ["kys", "harassment", "critical"],
    ["you're so stupid and ugly", "harassment", "medium"],
    ["I'm going to kill you", "threat", "critical"],
    ["bring a gun to school", "threat", "critical"],
    ["that's so retarded", "hate", "high"],
    ["want to vape after", "drugs_alcohol", "medium"],
    ["what the fuck", "profanity", "low"],
  ];
  for (const [text, category, severity] of cases) {
    it(`${category}: “${text}”`, () => {
      const hit = analyzeText(text).find((h) => h.category === category);
      expect(hit, `no ${category} hit for “${text}”; got ${JSON.stringify(cats(text))}`).toBeTruthy();
      if (severity) expect(hit!.severity).toBe(severity);
    });
  }
});

describe("must NOT flag — normal music-lesson and middle-school talk", () => {
  const clean = [
    "You killed that solo today!",
    "Keep a steady beat with the metronome",
    "Work on the slurs in measure 12",
    "Practice your high notes slowly",
    "Shoot for 15 minutes of long tones a day",
    "That run was sick",
    "Relax your body and breathe from your diaphragm",
    "You can call me Maya!",
    "The Bartók snap pizzicato is in bar 40",
    "I'll find you some good etudes for next week",
    "I hurt my lip playing too long",
    "I wasted a lot of practice time this week, sorry",
    "Bring your music and a pencil",
    "Your tonguing is getting cleaner",
    "Try blowing warmer air on the low notes",
    "We'll do scales, then the concert piece",
    "Your bass line was perfect",
    "Class starts at 4",
    "Can you pass me the rosin? just kidding lol",
    "Great work today, see you Thursday!",
    "My mom says Thursday works for the next lesson",
    "The piece has a hot tempo marking, like allegro vivace",
    "I'm going to kill it at the concert",
    "Ritardando at the end, then fermata",
    "Our band teacher said we can hang the posters",
    "Sounds good — see you then!",
    "5 minutes late, joining the Meet now",
  ];
  for (const text of clean) {
    it(`“${text}”`, () => {
      const hits = analyzeText(text).filter((h) => h.severity !== "low");
      expect(hits, JSON.stringify(hits)).toEqual([]);
    });
  }
});

describe("negation", () => {
  it("“we will never meet in person” is at most low", () => {
    const hit = analyzeText("we will never meet in person, lessons are online only").find((h) => h.category === "meeting");
    expect(!hit || hit.severity === "low").toBe(true);
  });
  it("negation does not soften secrecy (“don't tell” is itself the signal)", () => {
    expect(top("don't tell your mom")!.severity).toBe("critical");
  });
});

describe("policy — who wrote it decides what happens", () => {
  it("self-harm is never hidden (an adult must see it)", () => {
    expect(policy("self_harm", "critical", "family")).toEqual([]);
    const [f] = flagsForMessage(msg("i want to die", "family"));
    expect(f.actions).toEqual([]);
    expect(f.severity).toBe("critical");
  });
  it("a tutor's sexual message is hidden and the tutor is paused", () => {
    const f = flagsForMessage(msg("send me a pic of you in bed", "tutor")).find((x) => x.category === "sexual")!;
    expect(f.actions).toEqual(["hide_message", "pause_tutor"]);
  });
  it("a student's harsh message is hidden but never pauses anyone", () => {
    const f = flagsForMessage(msg("I'm going to kill you", "family")).find((x) => x.category === "threat")!;
    expect(f.actions).toEqual(["hide_message"]);
  });
  it("medium flags only queue for review", () => {
    const f = flagsForMessage(msg("how old are you?", "family"));
    expect(f.every((x) => x.actions.length === 0)).toBe(true);
  });
  it("the same words are more serious from a tutor", () => {
    const t = flagsForMessage(msg("where do you live?", "tutor"))[0];
    const s = flagsForMessage(msg("where do you live?", "family"))[0];
    expect(t.score).toBeGreaterThan(s.score);
  });
  it("severity thresholds", () => {
    expect(severityFor(9)).toBe("critical");
    expect(severityFor(7)).toBe("high");
    expect(severityFor(4)).toBe("medium");
    expect(severityFor(2)).toBe("low");
    expect(severityFor(1)).toBeNull();
  });
});

describe("conversation patterns", () => {
  it("flags a grooming pattern built from individually-medium tutor messages", () => {
    const flags = flagsForConversation("th1", "tutor-1", [
      msg("great lesson! how old are you btw", "tutor"),
      msg("12", "family"),
      msg("you're so mature for your age", "tutor"),
      msg("we should hang out in person sometime", "tutor"),
    ]);
    const g = flags.find((f) => f.category === "grooming_pattern")!;
    expect(g).toBeTruthy();
    expect(g.severity).toBe("critical");
    expect(g.actions).toEqual(["pause_tutor"]);
    expect(g.author_id).toBe("tutor-1");
  });
  it("does not flag a normal lesson conversation", () => {
    const flags = flagsForConversation("th1", "tutor-1", [
      msg("Hi! Looking forward to our first lesson", "tutor"),
      msg("Me too! I play clarinet", "family"),
      msg("Bring your music and a pencil. We'll work on long tones", "tutor"),
      msg("Great work today, you killed that scale", "tutor"),
    ]);
    expect(flags).toEqual([]);
  });
  it("flags late-night tutor messages (3+ between 11 PM and 6 AM ET)", () => {
    const flags = flagsForConversation("th1", "tutor-1", [
      msg("hey", "tutor", "2026-09-20T04:10:00Z"),
      msg("you up?", "tutor", "2026-09-21T04:30:00Z"),
      msg("hello?", "tutor", "2026-09-22T05:00:00Z"),
    ]);
    expect(flags.map((f) => f.category)).toContain("late_night_contact");
  });
  it("flags repeated bullying from one side", () => {
    const flags = flagsForConversation("th1", "tutor-1", [
      msg("you're so stupid", "family"),
      msg("you're such a loser", "family"),
      msg("you're worthless", "family"),
    ]);
    expect(flags.find((f) => f.category === "bullying_pattern")?.author_id).toBeNull();
  });
  it("one student question alone is not a pattern", () => {
    expect(flagsForConversation("th1", "tutor-1", [msg("how old are you?", "family")])).toEqual([]);
  });
});

describe("robustness (property)", () => {
  it("never throws, scores stay in range, for any input", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 800 }), (s) => {
        for (const h of analyzeText(s)) {
          expect(h.score).toBeGreaterThanOrEqual(2);
          expect(h.score).toBeLessThanOrEqual(10);
        }
      }),
      { numRuns: 3000 },
    );
  });
  it("is fast enough for a daily sweep (10k messages < 5s)", () => {
    const sample = "Great work today! Keep practicing long tones and the concert piece. See you Thursday at 4.";
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) analyzeText(sample + i);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
