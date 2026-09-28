import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { openSlots, weeklyStarts } from "./slots";
import { easternParts, easternToUtc, validateSlot } from "./time";

// Monday, October 5, 2026, 9:00 AM Eastern.
const now = easternToUtc("2026-10-05", "09:00")!;

describe("openSlots", () => {
  it("offers half-hour starts inside the tutor's blocks, 2+ hours ahead", () => {
    const slots = openSlots({ tutorAvailability: ["mon_afternoon"], studentAvailability: [], busy: [], minutes: 45, now, days: 1 });
    // After school is 3–5 PM: 3:00, 3:30, 4:00 fit a 45-minute lesson; 4:30 would end after 5.
    expect(slots.map((s) => s.time)).toEqual(["15:00", "15:30", "16:00"]);
    expect(slots.every((s) => s.date === "2026-10-05")).toBe(true);
  });

  it("skips times that overlap busy lessons and flags times the student is also free", () => {
    const busy = [{ start: easternToUtc("2026-10-06", "17:30")!.toISOString(), end: easternToUtc("2026-10-06", "18:15")!.toISOString() }];
    const slots = openSlots({ tutorAvailability: ["tue_early_evening"], studentAvailability: ["tue_early_evening"], busy, minutes: 30, now, days: 2 });
    expect(slots.map((s) => s.time)).toEqual(["17:00", "18:30"]);
    expect(slots.every((s) => s.both)).toBe(true);
  });

  it("never offers something the program rules reject (property)", () => {
    const blocks = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].flatMap((d) => ["morning", "midday", "afternoon", "early_evening", "evening"].map((b) => `${d}_${b}`));
    fc.assert(
      fc.property(
        fc.subarray(blocks, { minLength: 1 }),
        fc.constantFrom(30, 45, 60),
        fc.integer({ min: 0, max: 400 * 24 * 60 }),
        (tutor, minutes, offsetMin) => {
          const at = new Date(now.getTime() + offsetMin * 60000);
          for (const s of openSlots({ tutorAvailability: tutor, studentAvailability: [], busy: [], minutes, now: at, days: 8 })) {
            const start = new Date(s.start);
            const p = easternParts(start);
            const end = easternParts(new Date(start.getTime() + minutes * 60000));
            if (start.getTime() < at.getTime() + 2 * 3600_000) return false;
            if (p.minutes % 30 !== 0 || p.minutes < 8 * 60 || end.minutes > 22 * 60 || end.date !== p.date) return false;
            if (p.date !== s.date || p.time !== s.time) return false;
            if (validateSlot(start, minutes, at) !== null) return false;
          }
          return true;
        },
      ),
      { numRuns: 150 },
    );
    // ~150 runs × a week of slots, each re-checked through Intl: slow under a loaded parallel run.
  }, 30_000);
});

describe("weeklyStarts", () => {
  it("keeps 5 PM Eastern across the end of daylight saving time", () => {
    const starts = weeklyStarts("2026-10-22", "17:00", 3);
    expect(starts.map((d) => easternParts(d).time)).toEqual(["17:00", "17:00", "17:00"]);
    expect(starts.map((d) => easternParts(d).date)).toEqual(["2026-10-22", "2026-10-29", "2026-11-05"]);
    // The UTC hour changes when DST ends (Nov 1).
    expect(starts[1].getUTCHours()).toBe(21);
    expect(starts[2].getUTCHours()).toBe(22);
  });
});
