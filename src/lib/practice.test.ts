import { describe, expect, it } from "vitest";
import { cleanTasks, draftProblem, dueState, formatDue, groupBoard, type PracticeItem } from "./practice";

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

describe("groupBoard", () => {
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
    ...o,
  });
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
});
