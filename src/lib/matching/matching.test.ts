import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  matchTutors,
  rankStudentsForTutor,
  levelFit,
  areRelated,
  tieBreak,
  WEIGHTS,
  type StudentProfile,
  type TutorCandidate,
  type TutorSubject,
  type Tier,
} from "./index";
import { ALL_SLOTS, GOALS, LEVELS, type Level } from "../constants";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const INSTRUMENTS = [
  { subjectId: "s-clarinet", slug: "clarinet", name: "Clarinet", family: "woodwind" },
  { subjectId: "s-alto", slug: "alto-saxophone", name: "Alto Saxophone", family: "woodwind" },
  { subjectId: "s-flute", slug: "flute", name: "Flute", family: "woodwind" },
  { subjectId: "s-trumpet", slug: "trumpet", name: "Trumpet", family: "brass" },
  { subjectId: "s-trombone", slug: "trombone", name: "Trombone", family: "brass" },
  { subjectId: "s-euph", slug: "euphonium", name: "Euphonium", family: "brass" },
  { subjectId: "s-violin", slug: "violin", name: "Violin", family: "strings" },
  { subjectId: "s-viola", slug: "viola", name: "Viola", family: "strings" },
  { subjectId: "s-perc", slug: "percussion", name: "Concert Percussion", family: "percussion" },
  { subjectId: "s-ukulele", slug: "ukulele", name: "Ukulele", family: "other" },
];
const byId = (id: string) => INSTRUMENTS.find((i) => i.subjectId === id)!;

function tutorSubject(id: string, ownLevel: Level, teachLevels: Level[]): TutorSubject {
  return { ...byId(id), ownLevel, yearsPlaying: 4, topEnsemble: "school", teachLevels };
}

function tutor(p: Partial<TutorCandidate> & { tutorId: string }): TutorCandidate {
  return {
    displayName: p.tutorId,
    availability: ["thu_evening", "sat_morning"],
    teachingStrengths: ["fundamentals"],
    teachingStyle: "balanced",
    explainStyle: "balanced",
    sessionMinutes: [30, 45, 60],
    maxStudents: 3,
    activeStudents: 0,
    acceptingStudents: true,
    subjects: [tutorSubject("s-clarinet", "advanced", ["beginner", "developing", "intermediate", "advanced"])],
    ...p,
  };
}

function student(p: Partial<StudentProfile> = {}, level: Level = "beginner", subjectId = "s-clarinet"): StudentProfile {
  return {
    id: "student-1",
    firstName: "Leo",
    goals: ["fundamentals"],
    learningStyle: "structured",
    explainStyle: "show",
    availability: ["thu_evening", "sat_morning"],
    preferredMinutes: 45,
    subjects: [{ ...byId(subjectId), level }],
    ...p,
  };
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------
describe("levelFit", () => {
  it("is zero when the tutor doesn't teach that level", () => {
    expect(levelFit("beginner", ["advanced"])).toBe(0);
  });
  it("prefers specialists over generalists", () => {
    expect(levelFit("beginner", ["beginner"])).toBeGreaterThan(levelFit("beginner", LEVELS as unknown as Level[]));
  });
  it("is always within [0.5, 1] when the level is taught", () => {
    for (const l of LEVELS)
      for (let mask = 1; mask < 16; mask++) {
        const set = LEVELS.filter((_, i) => mask & (1 << i)) as Level[];
        const f = levelFit(l, set);
        if (set.includes(l)) {
          expect(f).toBeGreaterThanOrEqual(0.5);
          expect(f).toBeLessThanOrEqual(1);
        } else expect(f).toBe(0);
      }
  });
});

describe("matchTutors — basics", () => {
  it("returns nothing when no tutor plays the instrument or a related one", () => {
    const res = matchTutors(student({}, "beginner", "s-ukulele"), "s-ukulele", [tutor({ tutorId: "t1" })]);
    expect(res).toEqual([]);
  });

  it("returns nothing for an instrument that isn't on the student's profile", () => {
    expect(matchTutors(student(), "s-trumpet", [tutor({ tutorId: "t1" })])).toEqual([]);
  });

  it("never returns a tutor unrelated to the instrument", () => {
    const res = matchTutors(student(), "s-clarinet", [
      tutor({ tutorId: "trumpet-only", subjects: [tutorSubject("s-trumpet", "advanced", ["beginner"])] }),
    ]);
    expect(res).toEqual([]);
  });

  it("puts a tutor who doesn't teach the level in the stretch tier, below ideal matches", () => {
    const res = matchTutors(student({}, "beginner"), "s-clarinet", [
      tutor({ tutorId: "adv-only", subjects: [tutorSubject("s-clarinet", "advanced", ["advanced"])] }),
      tutor({ tutorId: "beg", subjects: [tutorSubject("s-clarinet", "intermediate", ["beginner"])] }),
    ]);
    expect(res.map((r) => [r.tutorId, r.tier])).toEqual([
      ["beg", "ideal"],
      ["adv-only", "stretch"],
    ]);
  });

  it("routes by compatibility, not seniority: a beginner-focused tutor beats an All-State tutor", () => {
    const allState = tutor({
      tutorId: "all-state",
      subjects: [{ ...tutorSubject("s-clarinet", "advanced", ["intermediate", "advanced"]), topEnsemble: "all_state", yearsPlaying: 9 }],
    });
    const beginnerFocused = tutor({
      tutorId: "patient",
      subjects: [{ ...tutorSubject("s-clarinet", "intermediate", ["beginner", "developing"]), yearsPlaying: 3 }],
    });
    const res = matchTutors(student({}, "beginner"), "s-clarinet", [allState, beginnerFocused]);
    expect(res[0].tutorId).toBe("patient");
  });

  it("still gives an advanced student the advanced-focused tutor", () => {
    const res = matchTutors(student({}, "advanced"), "s-clarinet", [
      tutor({ tutorId: "beg", subjects: [tutorSubject("s-clarinet", "advanced", ["beginner", "developing"])] }),
      tutor({ tutorId: "adv", subjects: [tutorSubject("s-clarinet", "advanced", ["intermediate", "advanced"])] }),
    ]);
    expect(res[0].tutorId).toBe("adv");
    expect(res[0].tier).toBe("ideal");
  });

  it("marks full tutors as not requestable and ranks them last", () => {
    const res = matchTutors(student(), "s-clarinet", [
      tutor({ tutorId: "full", activeStudents: 3, maxStudents: 3 }),
      tutor({ tutorId: "closed", acceptingStudents: false }),
      tutor({ tutorId: "open", availability: [] }),
    ]);
    expect(res[0].tutorId).toBe("open");
    expect(res.filter((r) => r.tier === "full").map((r) => r.tutorId).sort()).toEqual(["closed", "full"]);
    expect(res.filter((r) => r.tier === "full").every((r) => !r.canRequest)).toBe(true);
  });

  it("keeps an existing tutor requestable even when they're full", () => {
    const res = matchTutors(student({ currentTutorIds: ["mine"] }), "s-clarinet", [
      tutor({ tutorId: "mine", activeStudents: 3, maxStudents: 3 }),
    ]);
    expect(res[0].tier).toBe("ideal");
    expect(res[0].canRequest).toBe(true);
    expect(res[0].reasons[0]).toMatch(/Already working with Leo/);
  });

  it("offers related instruments only when there is no ideal match (auto)", () => {
    const sax = tutor({ tutorId: "sax", subjects: [tutorSubject("s-alto", "advanced", ["beginner"])] });
    const onlyRelated = matchTutors(student(), "s-clarinet", [sax]);
    expect(onlyRelated.map((r) => [r.tutorId, r.tier])).toEqual([["sax", "related"]]);
    expect(onlyRelated[0].reasons[0]).toMatch(/closely related/);

    const withIdeal = matchTutors(student(), "s-clarinet", [sax, tutor({ tutorId: "clar" })]);
    expect(withIdeal.map((r) => r.tutorId)).toEqual(["clar"]);
  });

  it("does not offer related instruments across families", () => {
    expect(areRelated("clarinet", "trumpet")).toBe(false);
    expect(areRelated("trombone", "euphonium")).toBe(true);
    expect(areRelated("violin", "violin")).toBe(false);
  });

  it("rewards shared availability and explains it", () => {
    const res = matchTutors(student(), "s-clarinet", [
      tutor({ tutorId: "overlap" }),
      tutor({ tutorId: "none", availability: ["mon_morning"] }),
    ]);
    expect(res[0].tutorId).toBe("overlap");
    expect(res[0].sharedSlots).toEqual(["thu_evening", "sat_morning"]);
    expect(res[1].cautions.join(" ")).toMatch(/No shared times/);
  });

  it("spreads students: an otherwise-identical tutor with more open spots ranks first", () => {
    const res = matchTutors(student(), "s-clarinet", [
      tutor({ tutorId: "busy", activeStudents: 2, maxStudents: 3 }),
      tutor({ tutorId: "free", activeStudents: 0, maxStudents: 3 }),
    ]);
    expect(res[0].tutorId).toBe("free");
  });

  it("notes when the preferred lesson length isn't offered", () => {
    const res = matchTutors(student({ preferredMinutes: 60 }), "s-clarinet", [tutor({ tutorId: "t", sessionMinutes: [30] })]);
    expect(res[0].cautions.join(" ")).toMatch(/30-minute/);
  });

  it("ignores duplicate candidates", () => {
    const t = tutor({ tutorId: "dup" });
    expect(matchTutors(student(), "s-clarinet", [t, t, t])).toHaveLength(1);
  });

  it("handles a student with no goals, styles, or availability (still matchable)", () => {
    const res = matchTutors(
      student({ goals: [], learningStyle: null, explainStyle: null, availability: [] }),
      "s-clarinet",
      [tutor({ tutorId: "t" })],
    );
    expect(res).toHaveLength(1);
    expect(res[0].tier).toBe("ideal");
    expect(res[0].score).toBeGreaterThan(0);
  });

  it("scores a perfect match at 100", () => {
    const res = matchTutors(
      student({ goals: ["fundamentals"], learningStyle: "structured", explainStyle: "show", availability: ["thu_evening", "sat_morning", "sun_evening"] }),
      "s-clarinet",
      [
        tutor({
          tutorId: "perfect",
          availability: ["thu_evening", "sat_morning", "sun_evening"],
          teachingStrengths: ["fundamentals"],
          teachingStyle: "structured",
          explainStyle: "show",
          subjects: [tutorSubject("s-clarinet", "intermediate", ["beginner"])],
        }),
      ],
    );
    expect(res[0].score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — thousands of random students and tutor pools
// ---------------------------------------------------------------------------
const levelArb = fc.constantFrom(...LEVELS);
const levelSetArb = fc.subarray([...LEVELS], { minLength: 1 }) as fc.Arbitrary<Level[]>;
const slotsArb = fc.subarray(ALL_SLOTS as string[], { maxLength: 12 });
const goalsArb = fc.subarray(GOALS.map((g) => g.key) as string[], { maxLength: 3 });
const styleArb = fc.constantFrom(null, "structured", "flexible", "balanced");
const explainArb = fc.constantFrom(null, "show", "tell", "balanced");
const minutesSetArb = fc.subarray([30, 45, 60], { minLength: 1 });

const tutorSubjectArb: fc.Arbitrary<TutorSubject> = fc
  .record({ inst: fc.constantFrom(...INSTRUMENTS), own: fc.constantFrom<Level>("intermediate", "advanced"), teach: levelSetArb, years: fc.integer({ min: 1, max: 15 }) })
  .map(({ inst, own, teach, years }) => ({
    ...inst,
    ownLevel: own,
    yearsPlaying: years,
    topEnsemble: "school",
    teachLevels: teach.filter((l) => LEVELS.indexOf(l) <= LEVELS.indexOf(own)).length
      ? teach.filter((l) => LEVELS.indexOf(l) <= LEVELS.indexOf(own))
      : ["beginner"],
  }));

const tutorArb = (id: string): fc.Arbitrary<TutorCandidate> =>
  fc
    .record({
      availability: slotsArb,
      teachingStrengths: goalsArb,
      teachingStyle: styleArb,
      explainStyle: explainArb,
      sessionMinutes: minutesSetArb,
      maxStudents: fc.integer({ min: 1, max: 8 }),
      activeFrac: fc.double({ min: 0, max: 1.2, noNaN: true }),
      acceptingStudents: fc.boolean(),
      subjects: fc.uniqueArray(tutorSubjectArb, { minLength: 1, maxLength: 3, selector: (s) => s.subjectId }),
    })
    .map((r) => ({
      tutorId: id,
      displayName: id,
      availability: r.availability,
      teachingStrengths: r.teachingStrengths,
      teachingStyle: r.teachingStyle,
      explainStyle: r.explainStyle,
      sessionMinutes: r.sessionMinutes,
      maxStudents: r.maxStudents,
      activeStudents: Math.floor(r.activeFrac * r.maxStudents),
      acceptingStudents: r.acceptingStudents,
      subjects: r.subjects,
    }));

const poolArb = fc.integer({ min: 0, max: 25 }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => tutorArb(`t${i}`))));

const studentArb: fc.Arbitrary<StudentProfile> = fc
  .record({
    id: fc.uuid(),
    inst: fc.constantFrom(...INSTRUMENTS),
    level: levelArb,
    goals: goalsArb,
    learningStyle: styleArb,
    explainStyle: explainArb,
    availability: slotsArb,
    preferredMinutes: fc.constantFrom(30, 45, 60),
  })
  .map((r) => ({
    id: r.id,
    firstName: "Sam",
    goals: r.goals,
    learningStyle: r.learningStyle,
    explainStyle: r.explainStyle,
    availability: r.availability,
    preferredMinutes: r.preferredMinutes,
    subjects: [{ ...r.inst, level: r.level }],
  }));

const RUNS = { numRuns: 3000 };
const TIER_ORDER: Tier[] = ["ideal", "stretch", "related", "full"];

describe("matchTutors — properties (3,000 random scenarios each)", () => {
  it("scores are integers in [0, 100] and breakdowns stay within their weights", () => {
    fc.assert(
      fc.property(studentArb, poolArb, (s, pool) => {
        for (const m of matchTutors(s, s.subjects[0].subjectId, pool, { includeRelated: "always" })) {
          expect(Number.isInteger(m.score)).toBe(true);
          expect(m.score).toBeGreaterThanOrEqual(0);
          expect(m.score).toBeLessThanOrEqual(100);
          expect(m.breakdown.level).toBeLessThanOrEqual(WEIGHTS.level);
          expect(m.breakdown.availability).toBeLessThanOrEqual(WEIGHTS.availability);
          expect(m.breakdown.goals).toBeLessThanOrEqual(WEIGHTS.goals);
          expect(m.breakdown.style).toBeLessThanOrEqual(WEIGHTS.style);
          expect(m.breakdown.capacity).toBeLessThanOrEqual(WEIGHTS.capacity);
        }
      }),
      RUNS,
    );
  });

  it("results are sorted by tier, then score (desc)", () => {
    fc.assert(
      fc.property(studentArb, poolArb, (s, pool) => {
        const res = matchTutors(s, s.subjects[0].subjectId, pool, { includeRelated: "always" });
        for (let i = 1; i < res.length; i++) {
          const a = TIER_ORDER.indexOf(res[i - 1].tier);
          const b = TIER_ORDER.indexOf(res[i].tier);
          expect(a).toBeLessThanOrEqual(b);
          if (a === b) expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
        }
      }),
      RUNS,
    );
  });

  it("every tier's hard rules hold for every result", () => {
    fc.assert(
      fc.property(studentArb, poolArb, (s, pool) => {
        const target = s.subjects[0];
        for (const m of matchTutors(s, target.subjectId, pool, { includeRelated: "always" })) {
          const t = pool.find((x) => x.tutorId === m.tutorId)!;
          const hasRoom = t.acceptingStudents && t.activeStudents < t.maxStudents;
          if (m.tier === "ideal") {
            expect(m.subject.subjectId).toBe(target.subjectId);
            expect(m.subject.teachLevels).toContain(target.level);
            expect(hasRoom).toBe(true);
            expect(m.canRequest).toBe(true);
          }
          if (m.tier === "stretch") {
            expect(m.subject.subjectId).toBe(target.subjectId);
            expect(m.subject.teachLevels).not.toContain(target.level);
            expect(hasRoom).toBe(true);
          }
          if (m.tier === "related") {
            expect(areRelated(m.subject.slug, target.slug)).toBe(true);
            expect(m.subject.teachLevels).toContain(target.level);
            expect(hasRoom).toBe(true);
          }
          if (m.tier === "full") {
            expect(m.subject.subjectId).toBe(target.subjectId);
            expect(hasRoom).toBe(false);
            expect(m.canRequest).toBe(false);
          }
        }
      }),
      RUNS,
    );
  });

  it("no eligible tutor is ever dropped: every tutor who plays the instrument appears exactly once", () => {
    fc.assert(
      fc.property(studentArb, poolArb, (s, pool) => {
        const target = s.subjects[0];
        const res = matchTutors(s, target.subjectId, pool);
        const ids = res.map((r) => r.tutorId);
        expect(new Set(ids).size).toBe(ids.length);
        for (const t of pool) {
          if (t.subjects.some((x) => x.subjectId === target.subjectId)) expect(ids).toContain(t.tutorId);
          if (!t.subjects.some((x) => x.subjectId === target.subjectId || areRelated(x.slug, target.slug)))
            expect(ids).not.toContain(t.tutorId);
        }
      }),
      RUNS,
    );
  });

  it("every student is matchable whenever any tutor with room plays their instrument", () => {
    fc.assert(
      fc.property(studentArb, poolArb, (s, pool) => {
        const target = s.subjects[0];
        const anyWithRoom = pool.some(
          (t) => t.acceptingStudents && t.activeStudents < t.maxStudents && t.subjects.some((x) => x.subjectId === target.subjectId),
        );
        const res = matchTutors(s, target.subjectId, pool);
        if (anyWithRoom) expect(res.some((r) => r.canRequest)).toBe(true);
      }),
      RUNS,
    );
  });

  it("is deterministic and independent of candidate order", () => {
    fc.assert(
      fc.property(studentArb, poolArb, fc.integer(), (s, pool, seed) => {
        const a = matchTutors(s, s.subjects[0].subjectId, pool, { includeRelated: "always" });
        const shuffled = [...pool].sort((x, y) => tieBreak(String(seed), x.tutorId) - tieBreak(String(seed), y.tutorId));
        const b = matchTutors(s, s.subjects[0].subjectId, shuffled, { includeRelated: "always" });
        expect(b.map((m) => [m.tutorId, m.tier, m.score])).toEqual(a.map((m) => [m.tutorId, m.tier, m.score]));
      }),
      RUNS,
    );
  });

  it("never rewards seniority: raising a tutor's own level/ensemble/years alone never raises their score", () => {
    fc.assert(
      fc.property(studentArb, tutorArb("t0"), (s, t) => {
        const target = s.subjects[0];
        const base = { ...t, subjects: [{ ...t.subjects[0], ...target, teachLevels: t.subjects[0].teachLevels }] };
        const senior = {
          ...base,
          subjects: [{ ...base.subjects[0], ownLevel: "advanced" as Level, yearsPlaying: 15, topEnsemble: "all_state" }],
        };
        const a = matchTutors(s, target.subjectId, [base])[0];
        const b = matchTutors(s, target.subjectId, [senior])[0];
        expect(b.score).toBeLessThanOrEqual(a.score);
      }),
      RUNS,
    );
  });

  it("more shared availability never lowers a score", () => {
    fc.assert(
      fc.property(studentArb, tutorArb("t0"), fc.constantFrom(...ALL_SLOTS), (s, t, extra) => {
        const target = s.subjects[0];
        const base = { ...t, subjects: [{ ...t.subjects[0], ...target, teachLevels: t.subjects[0].teachLevels }] };
        const st = { ...s, availability: s.availability.includes(extra) ? s.availability : [...s.availability, extra] };
        const more = { ...base, availability: base.availability.includes(extra) ? base.availability : [...base.availability, extra] };
        const a = matchTutors(st, target.subjectId, [base])[0];
        const b = matchTutors(st, target.subjectId, [more])[0];
        expect(b.score).toBeGreaterThanOrEqual(a.score);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Program-scale simulation: many families choosing their top match in turn.
// ---------------------------------------------------------------------------
describe("simulation — 600 students, 80 tutors", () => {
  it("never overbooks a tutor, matches every student whose instrument has capacity, and spreads the load", () => {
    const tutors = fc.sample(tutorArb("x"), { numRuns: 80, seed: 7 }).map((t, i) => ({ ...t, tutorId: `tutor-${i}`, activeStudents: 0, acceptingStudents: true }));
    const students = fc.sample(studentArb, { numRuns: 600, seed: 11 });

    const load = new Map<string, number>(tutors.map((t) => [t.tutorId, 0]));
    let matched = 0;
    let unmatchedWithCapacity = 0;

    for (const s of students) {
      const pool = tutors.map((t) => ({ ...t, activeStudents: load.get(t.tutorId)! }));
      const best = matchTutors(s, s.subjects[0].subjectId, pool).find((m) => m.canRequest);
      if (best) {
        load.set(best.tutorId, load.get(best.tutorId)! + 1);
        matched++;
      } else {
        const capacityExisted = pool.some(
          (t) => t.activeStudents < t.maxStudents && t.subjects.some((x) => x.subjectId === s.subjects[0].subjectId),
        );
        if (capacityExisted) unmatchedWithCapacity++;
      }
    }

    for (const t of tutors) expect(load.get(t.tutorId)!).toBeLessThanOrEqual(t.maxStudents);
    expect(unmatchedWithCapacity).toBe(0);
    expect(matched).toBeGreaterThan(0);
    const used = [...load.values()].filter((n) => n > 0).length;
    const eligible = tutors.filter((t) => students.some((s) => t.subjects.some((x) => x.subjectId === s.subjects[0].subjectId))).length;
    // Load balancing: the vast majority of tutors who could teach someone end up teaching someone.
    expect(used / eligible).toBeGreaterThan(0.85);
  });
});

// ---------------------------------------------------------------------------
// v2 signals: interests, county, reliability, and the tutor-side view
// ---------------------------------------------------------------------------
describe("matchTutors — v2 signals", () => {
  it("rewards shared interests and explains them", () => {
    const res = matchTutors(student({ interests: ["film_music", "jazz_music"] }), "s-clarinet", [
      tutor({ tutorId: "shares", interests: ["film_music"] }),
      tutor({ tutorId: "none", interests: ["country"] }),
    ]);
    expect(res[0].tutorId).toBe("shares");
    expect(res[0].sharedInterests).toEqual(["film_music"]);
    expect(res[0].reasons.join(" ")).toMatch(/movie & game music/);
  });

  it("a student with no interests is scored the same whatever the tutor's interests are (neutral)", () => {
    const a = matchTutors(student(), "s-clarinet", [tutor({ tutorId: "a", interests: [] })])[0].score;
    const b = matchTutors(student(), "s-clarinet", [tutor({ tutorId: "b", interests: ["pop", "rock"] })])[0].score;
    expect(a).toBe(b);
  });

  it("gives a small same-county bonus with a reason", () => {
    const res = matchTutors(student({ county: "Wake" }), "s-clarinet", [
      tutor({ tutorId: "far", county: "Buncombe" }),
      tutor({ tutorId: "near", county: "Wake" }),
    ]);
    expect(res[0].tutorId).toBe("near");
    expect(res[0].reasons.join(" ")).toMatch(/Wake County/);
  });

  it("repeated late cancellations lower a score, but are never shown as a reason or caution", () => {
    const [ok] = matchTutors(student(), "s-clarinet", [tutor({ tutorId: "ok", lateCancels: 0 })]);
    const [flaky] = matchTutors(student(), "s-clarinet", [tutor({ tutorId: "flaky", lateCancels: 4 })]);
    expect(flaky.score).toBeLessThan(ok.score);
    expect([...flaky.reasons, ...flaky.cautions].join(" ")).not.toMatch(/cancel/i);
  });

  it("one late cancellation is forgiven", () => {
    const [a] = matchTutors(student(), "s-clarinet", [tutor({ tutorId: "a", lateCancels: 0 })]);
    const [b] = matchTutors(student(), "s-clarinet", [tutor({ tutorId: "b", lateCancels: 1 })]);
    expect(a.score).toBe(b.score);
  });
});

describe("rankStudentsForTutor", () => {
  const t = tutor({ tutorId: "maya", subjects: [tutorSubject("s-clarinet", "advanced", ["beginner", "developing"])] });

  it("ranks students the tutor can help, best first, and omits the rest", () => {
    const res = rankStudentsForTutor(t, [
      student({ id: "adv" }, "advanced"),
      student({ id: "beg" }, "beginner"),
      student({ id: "trumpet" }, "beginner", "s-trumpet"),
      student({ id: "sax" }, "beginner", "s-alto"),
    ]);
    expect(res.map((r) => r.studentId)).toEqual(["beg", "adv", "sax"]);
    expect(res.map((r) => r.match.tier)).toEqual(["ideal", "stretch", "related"]);
  });

  it("picks the student's best instrument for this tutor", () => {
    const s = student({ id: "two", subjects: [{ ...byId("s-trumpet"), level: "beginner" }, { ...byId("s-clarinet"), level: "beginner" }] });
    const [r] = rankStudentsForTutor(t, [s]);
    expect(r.subject.subjectId).toBe("s-clarinet");
  });

  it("still shows students to a tutor whose schedule is full", () => {
    const full = { ...t, activeStudents: 3, maxStudents: 3 };
    const [r] = rankStudentsForTutor(full, [student({ id: "beg" })]);
    expect(r.match.tier).toBe("ideal");
  });

  it("agrees with the family's view: same score in both directions (property)", () => {
    fc.assert(
      fc.property(studentArb, tutorArb("t0"), (s, tt) => {
        const open = { ...tt, acceptingStudents: true, activeStudents: Math.min(tt.activeStudents, Math.max(0, tt.maxStudents - 1)) };
        const fromTutor = rankStudentsForTutor(tt, [s]);
        const fromStudent = matchTutors(s, s.subjects[0].subjectId, [open], { includeRelated: "always" });
        expect(fromTutor.length).toBe(fromStudent.length);
        if (fromTutor.length) expect(fromTutor[0].match.score).toBe(fromStudent[0].score);
      }),
      { numRuns: 2000 },
    );
  });

  it("is deterministic and independent of input order (property)", () => {
    fc.assert(
      fc.property(fc.array(studentArb, { maxLength: 15 }), tutorArb("t0"), (list, tt) => {
        const a = rankStudentsForTutor(tt, list).map((r) => r.studentId);
        const b = rankStudentsForTutor(tt, [...list].reverse()).map((r) => r.studentId);
        expect(new Set(a)).toEqual(new Set(b));
        expect(a).toEqual(rankStudentsForTutor(tt, list).map((r) => r.studentId));
      }),
      { numRuns: 500 },
    );
  });
});
