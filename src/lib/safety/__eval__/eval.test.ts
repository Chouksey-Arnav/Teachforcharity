/**
 * Accuracy gate for the safety analyzer. Prints a report and fails if quality
 * drops below the bar. Run: npx vitest run src/lib/safety/__eval__
 *
 * A message "counts as flagged" when it gets a medium+ flag (a person reviews
 * it) or is blocked before sending by the message filter.
 */
import { describe, expect, it } from "vitest";
import { flagsForMessage } from "../analyze";
import { messageViolation } from "../../moderation";
import { DEV } from "./corpus";
import { HOLDOUT, type Case } from "./holdout";
import { STRESS } from "./stress";

function score(cases: Case[]) {
  const misses: string[] = [];
  const falseAlarms: string[] = [];
  const wrongActions: string[] = [];
  let tp = 0, pos = 0, neg = 0;
  for (const c of cases) {
    const flags = flagsForMessage({ id: "m", thread_id: "t", sender_id: "u", sender_side: c.side, body: c.text, created_at: "2026-10-06T18:00:00Z" });
    const hit = flags.some((f) => f.severity !== "low") || Boolean(messageViolation(c.text));
    const desc = `[${c.side}] ${c.text}  → ${flags.map((f) => `${f.category}:${f.severity}${f.actions.length ? `(${f.actions})` : ""}`).join(", ") || "-"}`;
    if (c.flag) {
      pos++;
      if (hit) tp++;
      else misses.push(desc);
    } else {
      neg++;
      if (hit) falseAlarms.push(desc);
      if (flags.some((f) => f.actions.length)) wrongActions.push(desc);
    }
  }
  return { recall: tp / pos, tp, pos, falseAlarms, wrongActions, neg, misses };
}

function report(name: string, r: ReturnType<typeof score>) {
  console.log(`\n${name}: recall ${r.tp}/${r.pos} (${(100 * r.recall).toFixed(0)}%), false alarms ${r.falseAlarms.length}/${r.neg}, wrong automatic actions ${r.wrongActions.length}`);
  for (const m of r.misses) console.log(`  MISS   ${m}`);
  for (const m of r.falseAlarms) console.log(`  FALSE  ${m}`);
}

describe("safety analyzer accuracy", () => {
  const dev = score(DEV);
  const holdout = score(HOLDOUT);
  report("DEV", dev);
  report("HOLDOUT", holdout);
  // Reported, not gated: an honest measurement on text the rules were never tuned to.
  const stress = score(STRESS);
  report("STRESS (reported only)", stress);

  it("never takes an automatic action on normal lesson talk", () => {
    expect(dev.wrongActions).toEqual([]);
    expect(holdout.wrongActions).toEqual([]);
    expect(stress.wrongActions).toEqual([]);
  });
  it("dev set: catches every case it was tuned on, with no false alarms", () => {
    expect(dev.misses).toEqual([]);
    expect(dev.falseAlarms).toEqual([]);
  });
  it("holdout set: at least 85% recall and at most 1 false alarm", () => {
    expect(holdout.recall).toBeGreaterThanOrEqual(0.85);
    expect(holdout.falseAlarms.length).toBeLessThanOrEqual(1);
  });
});
