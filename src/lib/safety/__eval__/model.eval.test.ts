/**
 * LIVE accuracy of the full pipeline (rules + AI reviewer) on every labeled set.
 * Skipped unless ANTHROPIC_API_KEY is set; costs a few cents per run.
 *   ANTHROPIC_API_KEY=… npx vitest run src/lib/safety/__eval__/model.eval.test.ts
 * Run it before turning SAFETY_MODEL_REVIEW on, and after changing the prompt.
 */
import { describe, expect, it } from "vitest";
import { flagsForMessage } from "../analyze";
import { messageViolation } from "../../moderation";
import { reviewWithModel } from "../model-review";
import { DEV } from "./corpus";
import { HOLDOUT } from "./holdout";
import { STRESS } from "./stress";

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("rules + AI reviewer (live)", () => {
  it("adds recall without false alarms on normal lesson talk", { timeout: 300_000 }, async () => {
    const all = [...DEV, ...HOLDOUT, ...STRESS].map((c, i) => ({ ...c, id: String(i) }));
    const byRules = new Set(
      all.filter((c) => Boolean(messageViolation(c.text)) || flagsForMessage({ id: c.id, thread_id: "t", sender_id: "u", sender_side: c.side, body: c.text, created_at: "2026-10-06T18:00:00Z" }).some((f) => f.severity !== "low")).map((c) => c.id),
    );
    const t0 = Date.now();
    const review = await reviewWithModel(all.filter((c) => !byRules.has(c.id)).map((c) => ({ id: c.id, side: c.side, kind: "message" as const, body: c.text })));
    const byModel = new Set(review.findings.map((f) => f.id));
    const pos = all.filter((c) => c.flag), neg = all.filter((c) => !c.flag);
    const caught = pos.filter((c) => byRules.has(c.id) || byModel.has(c.id)).length;
    const falseAlarms = neg.filter((c) => byRules.has(c.id) || byModel.has(c.id));
    console.log(`rules+AI: recall ${caught}/${pos.length}, false alarms ${falseAlarms.length}/${neg.length}, AI reviewed ${review.reviewed} in ${((Date.now() - t0) / 1000).toFixed(1)}s${review.error ? `, error: ${review.error}` : ""}`);
    for (const c of falseAlarms) console.log(`  FALSE  ${c.text} → ${review.findings.find((f) => f.id === c.id)?.reason}`);
    expect(review.error).toBeUndefined();
    expect(falseAlarms.length).toBeLessThanOrEqual(2);
  });
});
