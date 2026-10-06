import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nameProblem, verifyAccount, type AccountInput, type AccountMessage } from "./pipeline";
import { canonicalEmail, looksLikeMash, statedAges } from "./signals";

const base = (over: Partial<AccountInput> = {}): AccountInput => ({
  tutorId: "tutor-1",
  status: "pending",
  fullName: "Maya Patel",
  email: "maya.patel@gmail.com",
  grade: 11,
  school: "Green Level High School",
  bio: "I've played violin for eight years and sit second chair in my school orchestra. I love helping younger players with scales, shifting and sight reading, and I like to keep lessons relaxed and fun.",
  meetUrl: "https://meet.google.com/abc-defg-hij",
  guardianName: "Priya Patel",
  guardianEmail: "priya.patel@outlook.com",
  guardianApprovedName: "Priya Patel",
  messages: [],
  openFlags: { critical: 0, high: 0, medium: 0 },
  reports: { open: 0, last90: 0 },
  attendance: { logged: 0, studentSaidAbsent: 0, loggedWithoutJoining: 0 },
  ...over,
});

let n = 0;
const msg = (body: string, side: "tutor" | "family" = "tutor", thread = "th1", at = "2026-10-01T21:00:00Z"): AccountMessage => ({ id: `m${++n}`, threadId: thread, senderSide: side, body, createdAt: at });
const ids = (a: AccountInput) => verifyAccount(a).checks.filter((c) => c.outcome !== "pass").map((c) => c.id);

describe("a normal tutor is verified with no human involved", () => {
  it("clean profile, no history", () => {
    const v = verifyAccount(base());
    expect(v.decision).toBe("verified");
    expect(v.risk).toBe(0);
  });
  it("ordinary lesson messages", () => {
    const v = verifyAccount(
      base({
        status: "active",
        messages: [
          msg("Hi Sam! Looking forward to Thursday. Bring your concert music and a pencil."),
          msg("Great work today — you killed that solo. Practice measures 20–40 slowly with the metronome at 80."),
          msg("Thanks! See you next week", "family"),
          msg("Keep the beat steady and shoot for 15 minutes a day of long tones."),
          msg("Can we move to 5:30? My mom has to drive my brother to practice", "family"),
        ],
        attendance: { logged: 6, studentSaidAbsent: 0, loggedWithoutJoining: 1 },
      }),
    );
    expect(v.decision).toBe("verified");
    expect(v.checks.every((c) => c.outcome === "pass")).toBe(true);
  });
  it("music words that sound bad out of context don't fire", () => {
    const v = verifyAccount(base({ bio: "I play trumpet in the marching band. I love high notes, slurs, and teaching how to keep the beat. Our section killed it at the district festival this year." }));
    expect(v.decision).toBe("verified");
  });
  it("years of playing aren't an age", () => {
    expect(statedAges("i've played for 9 years and i'm 16")).toEqual([16]);
    expect(statedAges("i'm 20 minutes from school")).toEqual([]);
    expect(statedAges("i am 3 years into piano")).toEqual([]);
  });
  it("a missing bio and Meet link are notes, not blockers", () => {
    const v = verifyAccount(base({ bio: null, meetUrl: null }));
    expect(v.decision).toBe("verified");
    expect(v.tutorHints.length).toBe(2);
  });
});

describe("identity", () => {
  it.each([
    ["asdfgh jkl", "random letters"],
    ["Test User", "placeholder"],
    ["Maya", "no last name"],
    ["M4ya P4tel", "digits"],
    ["xXdemonXx", "no last name"],
  ])("rejects %s", (name, why) => expect(nameProblem(name)).toMatch(new RegExp(why.split(" ")[0])));
  it.each(["Maya Patel", "José García-López", "Seo-yeon Kim", "J. R. Smith", "Mary-Kate O'Brien", "Nguyễn Văn An"])("accepts %s", (name) =>
    expect(nameProblem(name)).toBeNull(),
  );
  it("mash detection leaves real names alone", () => {
    for (const w of ["Christopher", "Strand", "Schmidt", "Schwartz", "Nguyen", "Lynn", "Wright"]) expect(looksLikeMash(w)).toBe(false);
  });

  it("blocks a tutor who approved themselves with a Gmail dot/+tag alias", () => {
    expect(canonicalEmail("Maya.Patel+mom@gmail.com")).toBe("mayapatel@gmail.com");
    const v = verifyAccount(base({ guardianEmail: "m.a.y.a.patel+mom@googlemail.com" }));
    expect(v.decision).toBe("blocked");
    expect(ids(base({ guardianEmail: "mayapatel+parent@gmail.com" }))).toContain("guardian_self");
  });
  it("blocks when the parent's name is the tutor's", () => expect(verifyAccount(base({ guardianName: "maya  PATEL" })).decision).toBe("blocked"));
  it("warns when the parent's address is built from the tutor's name", () => {
    const v = verifyAccount(base({ guardianEmail: "mayapatelparent@yahoo.com" }));
    expect(ids(base({ guardianEmail: "mayapatelparent@yahoo.com" }))).toContain("guardian_self");
    expect(v.decision).toBe("verified"); // 20 points: a note for admins, not a block on its own
  });
  it("a different-surname approver is only a note", () => {
    const v = verifyAccount(base({ guardianApprovedName: "Robert Chen" }));
    expect(ids(base({ guardianApprovedName: "Robert Chen" }))).toContain("guardian_signed_as");
    expect(v.decision).toBe("verified");
  });
});

describe("profile text", () => {
  it.each([
    ["Text me at 919-555-0123 to set up lessons, I play violin", "bio_contact"],
    ["Add me on snapchat, I teach clarinet and band music", "bio_contact"],
    ["Add me on snap, I teach clarinet and band music", "bio_safety"],
    ["Clarinet lessons, $20 per lesson, I've played 6 years in band", "bio_commercial"],
    ["I charge a small fee for piano lessons but I am patient", "bio_commercial"],
    ["Hi I'm 24 and I play guitar and teach music lessons", "bio_age"],
  ])("%s → %s", (bio, id) => {
    const v = verifyAccount(base({ bio }));
    expect(ids(base({ bio }))).toContain(id);
    expect(v.decision).not.toBe("verified");
  });
  it("blocks sexual or grooming language in a bio", () => {
    expect(verifyAccount(base({ bio: "I teach flute. Don't tell your parents but lessons with me are special" })).decision).toBe("blocked");
    expect(verifyAccount(base({ bio: "s3nd n00dz and I'll teach you sax" })).decision).toBe("blocked");
  });
  it("flags gibberish and off-topic bios for a human", () => {
    expect(ids(base({ bio: "sdkfj qwpeoi zxmcn alskdj qwoeiru zmxncb laksjd qpwoei" }))).toContain("bio_language");
    expect(ids(base({ bio: "I am really into football and video games and I like hanging with friends after school" }))).toContain("bio_music");
  });
  it("grade outside 9–12 fails", () => expect(verifyAccount(base({ grade: 8 })).decision).toBe("review"));
  it("tutor hints never reveal safety rules", () => {
    const v = verifyAccount(base({ bio: "I teach flute. Don't tell your parents but lessons with me are special" }));
    expect(v.tutorHints.join(" ")).not.toMatch(/groom|secre|parent/i);
  });
});

describe("messages — every message, every conversation", () => {
  it("one critical tutor message blocks the account", () => {
    const v = verifyAccount(base({ status: "active", messages: [msg("great lesson"), msg("this is our secret, don't tell your mom")] }));
    expect(v.decision).toBe("blocked");
    expect(ids(base({ messages: [msg("this is our secret, don't tell your mom")] }))).toContain("msg_critical");
  });
  it("defeats disguised spelling", () => expect(verifyAccount(base({ messages: [msg("whats ur s n a p")] })).decision).not.toBe("verified"));
  it("a grooming pattern spread over harmless-looking messages blocks", () => {
    const v = verifyAccount(
      base({
        messages: [
          msg("you're so mature for your age", "tutor", "th1", "2026-09-20T20:00:00Z"),
          msg("are your parents home right now?", "tutor", "th1", "2026-09-22T20:00:00Z"),
          msg("we could hang out in person sometime", "tutor", "th1", "2026-09-24T20:00:00Z"),
        ],
      }),
    );
    expect(v.decision).toBe("blocked");
    expect(v.checks.some((c) => c.id === "pattern_grooming_pattern")).toBe(true);
  });
  it("a student telling the tutor to stop goes to a human", () => {
    const v = verifyAccount(base({ status: "active", messages: [msg("how was your weekend"), msg("please stop messaging me, that's creepy", "family")] }));
    expect(v.decision).toBe("review");
    expect(ids(base({ messages: [msg("you make me uncomfortable", "family")] }))).toContain("student_discomfort");
  });
  it("what the student says about themselves isn't held against the tutor", () => {
    const v = verifyAccount(base({ messages: [msg("ugh i hate my life, band test tomorrow", "family"), msg("You've got this! Let's run the scales together Thursday.")] }));
    expect(v.decision).toBe("verified");
  });
  it("late-night messaging three times is a note", () => {
    const late = ["2026-10-01T04:10:00Z", "2026-10-02T04:20:00Z", "2026-10-03T05:00:00Z"].map((t) => msg("did you practice?", "tutor", "th9", t));
    expect(ids(base({ messages: late }))).toContain("pattern_late_night_contact");
  });
});

describe("conduct and attendance", () => {
  it("an open critical flag blocks", () => expect(verifyAccount(base({ openFlags: { critical: 1, high: 0, medium: 0 } })).decision).toBe("blocked"));
  it("an open report needs a human", () => expect(verifyAccount(base({ reports: { open: 1, last90: 1 } })).decision).toBe("review"));
  it("students saying the tutor wasn't there, repeatedly, needs a human", () => {
    expect(verifyAccount(base({ attendance: { logged: 6, studentSaidAbsent: 2, loggedWithoutJoining: 0 } })).decision).toBe("review");
    expect(verifyAccount(base({ attendance: { logged: 6, studentSaidAbsent: 1, loggedWithoutJoining: 0 } })).decision).toBe("verified");
  });
  it("lessons logged without ever joining are a note for the tutor", () => {
    const v = verifyAccount(base({ attendance: { logged: 4, studentSaidAbsent: 0, loggedWithoutJoining: 4 } }));
    expect(v.tutorHints.join(" ")).toMatch(/Join/);
  });
  it("small notes add up to a review", () => {
    const v = verifyAccount(
      base({ bio: null, meetUrl: null, school: "Northside", guardianApprovedName: "Robert Chen", guardianEmail: "mayapatelparent@yahoo.com", reports: { open: 0, last90: 1 } }),
    );
    expect(v.risk).toBeGreaterThanOrEqual(35);
    expect(v.decision).toBe("review");
  });
});

describe("properties", () => {
  const arbInput = fc.record({
    fullName: fc.string({ maxLength: 40 }),
    bio: fc.option(fc.string({ maxLength: 600 })),
    school: fc.option(fc.string({ maxLength: 60 })),
    guardianEmail: fc.option(fc.emailAddress()),
    msgs: fc.array(fc.tuple(fc.string({ maxLength: 200 }), fc.boolean()), { maxLength: 15 }),
  });
  it("never throws; risk is 0–100; decision follows the rules", () => {
    fc.assert(
      fc.property(arbInput, (x) => {
        const v = verifyAccount(base({ fullName: x.fullName, bio: x.bio, school: x.school, guardianEmail: x.guardianEmail, messages: x.msgs.map(([b, t]) => msg(b, t ? "tutor" : "family")) }));
        expect(v.risk).toBeGreaterThanOrEqual(0);
        expect(v.risk).toBeLessThanOrEqual(100);
        const hard = v.checks.some((c) => c.hard && c.outcome === "fail");
        const fail = v.checks.some((c) => c.outcome === "fail");
        expect(v.decision).toBe(hard ? "blocked" : fail || v.risk >= 35 ? "review" : "verified");
      }),
      { numRuns: 300 },
    );
  });
  it("is deterministic", () => {
    const a = base({ messages: [msg("see you thursday")] });
    expect(verifyAccount(a)).toEqual(verifyAccount(a));
  });
  it("adding a clean message never makes a verified account worse", () => {
    fc.assert(
      fc.property(fc.constantFrom("See you Thursday!", "Nice job on the scales", "Bring your music", "Practice slowly with a metronome"), (body) => {
        expect(verifyAccount(base({ messages: [msg(body)] })).decision).toBe("verified");
      }),
    );
  });
});
