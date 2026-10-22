import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  addDays,
  cleanTasks,
  dayState,
  describeDay,
  draftProblem,
  dueState,
  formatDue,
  groupBoard,
  lastDays,
  looksDaily,
  practiceByStudent,
  practiceDays,
  practiceStreak,
  type PracticeItem,
} from "./practice";

describe("cleanTasks", () => {
  it("splits pasted lists and drops bullets, numbering and blanks", () => {
    expect(cleanTasks(["- Long tones\n2) Scales:  Bb  and F", "", "  ", "• Etude 4", "[x] Listen to Mvt 2"])).toEqual([
      "Long tones",
      "Scales: Bb and F",
      "Etude 4",
      "Listen to Mvt 2",
    ]);
  });
  it("keeps numbers that are part of the task", () => {
    expect(cleanTasks(["12-24 slowly", "3 times through"])).toEqual(["12-24 slowly", "3 times through"]);
  });
});

describe("draftProblem", () => {
  it("needs a task or a note", () => {
    expect(draftProblem(["", " "], "  ")).toMatch(/at least one/);
    expect(draftProblem([], "Great work today")).toBeNull();
  });
  it("names the task that breaks the rules, as a tutor's words", () => {
    expect(draftProblem(["Scales", "send me a selfie"], "")).toMatch(/^Task 2: Can’t include requests for photos/);
    expect(draftProblem(["Scales"], "you're so pretty")).toMatch(/^The note: Can’t include comments on/);
  });
  it("lets ordinary homework through", () => {
    expect(draftProblem(["Measures 20-40 at 72, 76, 80 bpm", "Send me a video of you playing the etude"], "Your tone is so beautiful — keep it up!")).toBeNull();
  });
  it("caps the number and length of tasks", () => {
    expect(draftProblem(Array.from({ length: 13 }, (_, i) => `Task ${i}`), "")).toMatch(/up to 12/);
    expect(draftProblem(["x".repeat(201)], "")).toMatch(/too long/);
  });
});

describe("due dates", () => {
  it("formats a plain date without shifting it", () => {
    expect(formatDue("2026-10-15")).toBe("Thu, Oct 15");
  });
  it("classifies against today", () => {
    expect(dueState(null, "2026-10-09")).toBeNull();
    expect(dueState("2026-10-08", "2026-10-09")).toBe("overdue");
    expect(dueState("2026-10-09", "2026-10-09")).toBe("today");
    expect(dueState("2026-10-11", "2026-10-09")).toBe("soon");
    expect(dueState("2026-10-20", "2026-10-09")).toBe("later");
  });
});

const item = (o: Partial<PracticeItem>): PracticeItem => ({
    id: Math.random().toString(36),
    kind: "task",
    body: "x",
    due_on: null,
    done_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    tutor_id: "t1",
    tutor_name: "Maya P.",
    tutor_avatar: null,
    student_id: "s1",
    student_name: "Leo",
    subject_name: "Clarinet",
    session_id: null,
    session_start: null,
    thread_id: null,
    my_side: "family",
    repeat: "once",
    created_on: "2026-10-01",
    checks: null,
    ...o,
  });

describe("groupBoard", () => {
  it("groups per tutor and student, sorts tasks by due date and puts the latest group first", () => {
    const g = groupBoard([
      item({ body: "later", due_on: "2026-10-20" }),
      item({ body: "soon", due_on: "2026-10-10" }),
      item({ body: "undated", created_at: "2026-10-03T00:00:00Z" }),
      item({ body: "done", done_at: "2026-10-02T00:00:00Z" }),
      item({ kind: "note", body: "note" }),
      item({ tutor_id: "t2", body: "other tutor", created_at: "2026-10-05T00:00:00Z" }),
    ]);
    expect(g.map((x) => x.tutorId)).toEqual(["t2", "t1"]);
    expect(g[1].open.map((x) => x.body)).toEqual(["soon", "later", "undated"]);
    expect(g[1].done.map((x) => x.body)).toEqual(["done"]);
    expect(g[1].notes.map((x) => x.body)).toEqual(["note"]);
  });
  it("puts running daily tasks first, finished ones with the done, and counts today's ticks", () => {
    const today = "2026-10-10";
    const g = groupBoard(
      [
        item({ body: "etude", due_on: "2026-10-11" }),
        item({ body: "long tones", repeat: "daily", due_on: "2026-10-14", checks: ["2026-10-09", today] }),
        item({ body: "scales", repeat: "daily", checks: ["2026-10-09"] }),
        item({ body: "old daily", repeat: "daily", due_on: "2026-10-08", checks: ["2026-10-08"] }),
        item({ body: "done once", done_at: "2026-10-09T15:00:00Z" }),
      ],
      today,
    )[0];
    expect(g.open.map((x) => x.body)).toEqual(["long tones", "scales", "etude"]);
    expect(g.done.map((x) => x.body)).toEqual(["done once", "old daily"]);
    expect([g.dailyToday, g.dailyTicked, g.onceDone, g.onceTotal]).toEqual([2, 1, 1, 2]);
  });
});

describe("looksDaily", () => {
  it("spots everyday practice", () => {
    for (const t of ["Long tones, 5 minutes a day", "Scales daily", "Lip slurs every day", "10 min per day", "Practice every night"]) expect(looksDaily(t)).toBe(true);
  });
  it("leaves one-off work alone", () => {
    for (const t of ["Learn measures 20-40", "Listen to a recording of the Holst", "Birthday piece by Friday", "Today: tune with the app"]) expect(looksDaily(t)).toBe(false);
  });
});

describe("day by day", () => {
  const today = "2026-10-10";
  it("counts days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(lastDays(3, "2026-11-01")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });
  it("only expects a daily task from the day it was set through its due date", () => {
    const t = item({ repeat: "daily", created_on: "2026-10-08", due_on: "2026-10-09", checks: ["2026-10-08"] });
    expect(practiceDays([t], lastDays(4, today)).map((d) => [d.daily, d.ticked])).toEqual([
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 0],
    ]);
  });
  it("puts a finished one-off task on the Eastern day it was ticked", () => {
    // 01:30 UTC on Oct 10 is still the evening of Oct 9 in North Carolina.
    const t = item({ done_at: "2026-10-10T01:30:00Z" });
    expect(practiceDays([t], ["2026-10-09", "2026-10-10"]).map((d) => d.finished)).toEqual([1, 0]);
  });
  it("names each day's state", () => {
    expect(dayState({ day: "2026-10-09", daily: 2, ticked: 2, finished: 0 }, today)).toBe("full");
    expect(dayState({ day: "2026-10-09", daily: 2, ticked: 1, finished: 0 }, today)).toBe("partial");
    expect(dayState({ day: "2026-10-09", daily: 2, ticked: 0, finished: 0 }, today)).toBe("missed");
    expect(dayState({ day: today, daily: 2, ticked: 0, finished: 0 }, today)).toBe("waiting");
    expect(dayState({ day: "2026-10-09", daily: 0, ticked: 0, finished: 1 }, today)).toBe("finished");
    expect(dayState({ day: "2026-10-09", daily: 0, ticked: 0, finished: 0 }, today)).toBe("none");
  });
  it("describes a day in words for screen readers", () => {
    expect(describeDay({ day: today, daily: 3, ticked: 2, finished: 1 }, today)).toBe("Today: 2 of 3 daily tasks practised, 1 task finished");
    expect(describeDay({ day: "2026-10-09", daily: 0, ticked: 0, finished: 0 }, today)).toBe("Fri, Oct 9: nothing to practise");
  });
  it("counts a streak that survives an untouched today but not a missed day", () => {
    const t = item({ repeat: "daily", created_on: "2026-10-01", checks: ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"] });
    expect(practiceStreak([t], today)).toBe(4);
    expect(practiceStreak([{ ...t, checks: [...t.checks!, today] }], today)).toBe(5);
    expect(practiceStreak([{ ...t, checks: ["2026-10-06", "2026-10-07", "2026-10-09"] }], today)).toBe(1);
    expect(practiceStreak([{ ...t, checks: ["2026-10-07", "2026-10-08"] }], today)).toBe(0);
  });
  it("summarises each student for the tutor", () => {
    const m = practiceByStudent(
      [
        item({ student_id: "a", repeat: "daily", created_on: "2026-10-01", checks: ["2026-10-09", today] }),
        item({ student_id: "a", due_on: "2026-10-08" }),
        item({ student_id: "b", student_name: "Ava", done_at: "2026-10-10T14:00:00Z" }),
        item({ student_id: "c", kind: "note" }),
      ],
      7,
      today,
    );
    expect([...m.keys()].sort()).toEqual(["a", "b"]);
    const a = m.get("a")!;
    expect([a.today.ticked, a.today.daily, a.activeDays, a.streak, a.openTasks, a.overdue]).toEqual([1, 1, 2, 2, 1, 1]);
    expect(m.get("b")!.today.finished).toBe(1);
  });

  const day = fc.integer({ min: 0, max: 40 }).map((n) => addDays("2026-09-01", n));
  const anyItem = fc
    .record({
      daily: fc.boolean(),
      created: day,
      due: fc.option(day, { nil: null }),
      checks: fc.array(day, { maxLength: 30 }),
      done: fc.option(day, { nil: null }),
    })
    .map((r) =>
      item({
        repeat: r.daily ? "daily" : "once",
        created_on: r.created,
        due_on: r.due,
        checks: r.daily ? [...new Set(r.checks)].sort() : null,
        done_at: !r.daily && r.done ? `${r.done}T16:00:00Z` : null,
      }),
    );
  it("never counts more ticks than tasks, and gives one entry per day (property)", () => {
    fc.assert(
      fc.property(fc.array(anyItem, { maxLength: 12 }), fc.integer({ min: 1, max: 21 }), (items, n) => {
        const out = practiceDays(items, lastDays(n, "2026-10-05"));
        expect(out).toHaveLength(n);
        for (const d of out) {
          expect(d.ticked).toBeLessThanOrEqual(d.daily);
          expect(d.daily).toBeLessThanOrEqual(items.length);
        }
        const streak = practiceStreak(items, "2026-10-05");
        expect(streak).toBeGreaterThanOrEqual(0);
        expect(streak).toBeLessThanOrEqual(61);
      }),
    );
  });
});
