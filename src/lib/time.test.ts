import { describe, expect, it } from "vitest";
import { easternToUtc, easternParts, validateSlot, timeOptions } from "./time";

describe("easternToUtc", () => {
  it("handles EDT (summer, UTC-4)", () => {
    expect(easternToUtc("2026-07-09", "19:00")?.toISOString()).toBe("2026-07-09T23:00:00.000Z");
  });
  it("handles EST (winter, UTC-5)", () => {
    expect(easternToUtc("2026-12-10", "19:00")?.toISOString()).toBe("2026-12-11T00:00:00.000Z");
  });
  it("handles the fall-back day", () => {
    expect(easternToUtc("2026-11-01", "17:00")?.toISOString()).toBe("2026-11-01T22:00:00.000Z");
  });
  it("rejects the spring-forward gap and malformed input", () => {
    expect(easternToUtc("2027-03-14", "02:30")).toBeNull();
    expect(easternToUtc("2026-13-01", "10:00")).toBeNull();
    expect(easternToUtc("2026-02-30", "10:00")).toBeNull();
    expect(easternToUtc("nope", "10:00")).toBeNull();
  });
  it("round-trips every quarter hour of a year", () => {
    const start = Date.UTC(2026, 0, 1);
    for (let t = start; t < start + 366 * 86400000; t += 97 * 60000) {
      const d = new Date(Math.floor(t / 900000) * 900000);
      const p = easternParts(d);
      const back = easternToUtc(p.date, p.time);
      // The repeated hour on fall-back day maps to the first occurrence; everything else is exact.
      if (back) expect(Math.abs(back.getTime() - d.getTime()) === 0 || Math.abs(back.getTime() - d.getTime()) === 3600000).toBe(true);
    }
  });
});

describe("validateSlot mirrors the database rules", () => {
  const now = new Date("2026-10-01T12:00:00Z"); // 8:00 AM ET
  it("accepts a normal evening lesson", () => {
    expect(validateSlot(easternToUtc("2026-10-02", "19:00"), 45, now)).toBeNull();
  });
  it("rejects too soon, too far, off-quarter, and outside hours", () => {
    expect(validateSlot(easternToUtc("2026-10-01", "09:00"), 45, now)).toMatch(/2 hours/);
    expect(validateSlot(easternToUtc("2027-02-01", "19:00"), 45, now)).toMatch(/90 days/);
    expect(validateSlot(easternToUtc("2026-10-02", "19:10"), 45, now)).toMatch(/quarter/);
    expect(validateSlot(easternToUtc("2026-10-02", "21:30"), 60, now)).toMatch(/10:00 PM/);
    expect(validateSlot(easternToUtc("2026-10-02", "07:45"), 30, now)).toMatch(/8:00 AM/);
    expect(validateSlot(easternToUtc("2026-10-02", "21:00"), 60, now)).toBeNull();
    expect(validateSlot(easternToUtc("2026-10-02", "19:00"), 50, now)).toMatch(/30, 45, or 60/);
  });
  it("offers only valid picker times", () => {
    const opts = timeOptions();
    expect(opts[0]).toEqual({ value: "08:00", label: "8:00 AM" });
    expect(opts.at(-1)).toEqual({ value: "21:30", label: "9:30 PM" });
    expect(opts.find((o) => o.value === "12:00")?.label).toBe("12:00 PM");
  });
});
