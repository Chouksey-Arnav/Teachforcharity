import { describe, expect, it } from "vitest";
import { INVITE_NOTE_MAX, inviteNoteProblem } from "./invite-note";

describe("inviteNoteProblem", () => {
  it.each([
    "",
    "   ",
    "Please say yes!! I really want to learn trumpet. Love you mom",
    "pls mom i want to get better at violin before the concert, it's free!",
    "I love you so much, you're the best dad ever",
    "Don't tell dad, it's a surprise. I want to play sax for his birthday",
    "Can you buy me a new clarinet reed? I'll pay you back",
  ])("lets a normal note through: %s", (note) => {
    expect(inviteNoteProblem(note)).toBeNull();
  });

  it.each([
    ["text me at 919-555-0101", /phone numbers/],
    ["add me on snapchat", /outside apps/],
    ["go to www.example.com", /links/],
    ["send me nudes", /not allowed/],
    ["you're a stupid idiot", /kind and about music/],
    ["I'll kill you", /kind and about music/],
    ["this is a scam click here to win a free iphone gift card", /kind and about music/],
    ["I want to die", /988/],
  ])("stops %s", (note, why) => {
    expect(inviteNoteProblem(note)).toMatch(why);
  });

  it("caps the length", () => {
    expect(inviteNoteProblem("a".repeat(INVITE_NOTE_MAX))).toBeNull();
    expect(inviteNoteProblem("a".repeat(INVITE_NOTE_MAX + 1))).toMatch(/200 characters/);
  });
});
