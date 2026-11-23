import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, drain, review } = vi.hoisted(() => ({ rpc: vi.fn(), drain: vi.fn(), review: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../supabase/admin", () => ({ createServiceClient: () => ({ rpc, from: () => {
  const query = { select: () => query, is: () => query, not: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: null }) };
  return query;
} }) }));
vi.mock("../email/worker", () => ({ drainOutbox: drain }));
vi.mock("./model-review", () => ({ MODEL_REVIEW_VERSION: "test", modelReviewEnabled: () => true, reviewWithModel: review }));
import { runSafetyScan } from "./scanner";

const family = { id: "family-msg", thread_id: "private-thread", sender_id: "family", sender_side: "family", body: "I want to kill myself", created_at: "2026-11-23T12:00:00Z" };
const admin = { ...family, id: "admin-msg", sender_side: "admin", body: "hello" };

beforeEach(() => {
  rpc.mockReset(); drain.mockReset(); review.mockReset();
  rpc.mockImplementation(async (name: string) => {
    switch (name) {
      case "moderation_start": return { data: 1 };
      case "moderation_batch": return { data: [] };
      case "moderation_staff_batch": return { data: [family, admin] };
      case "moderation_staff_apply": return { data: 1 };
      case "moderation_other_texts": return { data: [] };
      default: return { data: null };
    }
  });
});

describe("staff scan integration", () => {
  it("scans both sides, alerts through the queue and never sends private staff text to the model", async () => {
    const result = await runSafetyScan("cron");
    expect(result).toMatchObject({ ok: true, scanned: 2, flagged: 1 });
    const args = rpc.mock.calls.find(([name]) => name === "moderation_staff_apply")![1];
    expect(args.p_scanned).toEqual(["family-msg", "admin-msg"]);
    expect(args.p_flags).toEqual([expect.objectContaining({ source_type: "staff_message", source_id: "family-msg", category: "self_harm", actions: [], thread_id: null, message_id: null })]);
    expect(review).not.toHaveBeenCalled();
    expect(drain).toHaveBeenCalledWith(2);
  });

  it("reports a failed apply rather than acknowledging the batch", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "moderation_start") return { data: 1 };
      if (name === "moderation_batch") return { data: [] };
      if (name === "moderation_staff_batch") return { data: [family] };
      if (name === "moderation_staff_apply") return { error: { message: "apply failed" } };
      return { data: null };
    });
    const result = await runSafetyScan("manual");
    expect(result).toMatchObject({ ok: false, scanned: 0, error: "apply failed" });
    expect(rpc).toHaveBeenCalledWith("moderation_finish", { p_run: 1, p_error: "apply failed" });
  });
});
