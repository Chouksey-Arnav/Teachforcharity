import { describe, expect, it } from "vitest";
import { gateCheck, gateViews } from "../gate";
import { ATTACKS, LESSON_TALK } from "./gate-corpus";

const show = (c: { text: string; side?: string }) => `${c.side ? `[${c.side}] ` : ""}${JSON.stringify(c.text)}`;

describe("message gate", () => {
  it("blocks every evasion in the attack corpus", () => {
    const leaks = ATTACKS.filter((c) => !gateCheck(c.text, c.side)).map(show);
    expect(leaks).toEqual([]);
  });

  it("lets ordinary lesson talk through", () => {
    const blocked = LESSON_TALK.filter((c) => gateCheck(c.text, c.side)).map((c) => `${show(c)} → ${gateCheck(c.text, c.side)!.id}`);
    expect(blocked).toEqual([]);
  });

  it("never blocks a student reaching out for help", () => {
    for (const text of ["I want to kill myself", "he keeps asking me to send pictures and it makes me uncomfortable", "i don't want to be here anymore", "please stop messaging me"]) {
      expect(gateCheck(text, "family")).toBeNull();
    }
  });

  it("applies tutor-only rules only when a tutor wrote it", () => {
    expect(gateCheck("i love you", "family")).toBeNull();
    expect(gateCheck("i love you")).toBeNull();
    expect(gateCheck("i love you", "tutor")?.category).toBe("affection");
  });

  it("builds the views the SQL mirror expects", () => {
    const v = gateViews("Add me on Ѕnаp​chat! 919 five 5 5 - I234, ok?");
    expect(v.base).toBe("add me on snapchat! 919 five 5 5 - i234, ok?");
    expect(v.canon).toBe("add me on snapchat 919 five 5 5 i2ea ok");
    expect(v.squash).toBe("addmeonsnapchatfiveieaok");
    expect(v.digits).toBe(" 919-5-5-5-1234 ");
  });
});
