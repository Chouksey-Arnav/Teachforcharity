import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    messages = { parse };
  }
  return { default: Anthropic };
});

const { reviewWithModel, modelReviewEnabled } = await import("./model-review");

const item = (id: string, body: string) => ({ id, side: "tutor" as const, kind: "message" as const, body });
const ok = (findings: unknown[]) => ({ stop_reason: "end_turn", parsed_output: { findings } });

beforeEach(() => parse.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("AI reviewer", () => {
  it("is off unless explicitly turned on with a key", () => {
    vi.stubEnv("SAFETY_MODEL_REVIEW", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    expect(modelReviewEnabled()).toBe(false);
    vi.stubEnv("SAFETY_MODEL_REVIEW", "on");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(modelReviewEnabled()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    expect(modelReviewEnabled()).toBe(true);
  });

  it("maps numbered findings back to items and keeps only medium/high", async () => {
    parse.mockResolvedValueOnce(ok([
      { item: 2, category: "isolation", severity: "high", reason: "Undermines the parents." },
      { item: 1, category: "affection", severity: "low", reason: "Mild." },
      { item: 9, category: "sexual", severity: "high", reason: "Out of range index." },
    ]));
    const r = await reviewWithModel([item("a", "hi"), item("b", "your mom wouldn't get us")]);
    expect(r.findings).toEqual([{ id: "b", category: "isolation", severity: "high", reason: "Undermines the parents." }]);
    expect(r.reviewed).toBe(2);
    expect(r.error).toBeUndefined();
  });

  it("never sends ids, only numbered items with roles", async () => {
    parse.mockResolvedValueOnce(ok([]));
    await reviewWithModel([{ ...item("secret-uuid-123", "hello"), context: [{ side: "family", body: "hi!" }] }]);
    const sent = JSON.stringify(parse.mock.calls[0][0].messages);
    expect(sent).not.toContain("secret-uuid-123");
    expect(sent).toContain("[1] TUTOR wrote");
    expect(sent).toContain("STUDENT: hi!");
  });

  it("a declined batch is retried item by item; a declined item goes to a person", async () => {
    parse
      .mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null })
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null });
    const r = await reviewWithModel([item("a", "fine"), item("b", "something")]);
    expect(r.findings).toEqual([expect.objectContaining({ id: "b", category: "needs_review", severity: "medium" })]);
    expect(r.reviewed).toBe(2);
  });

  it("an API failure never throws; the rules' result stands", async () => {
    parse.mockRejectedValueOnce(new Error("socket hang up"));
    const r = await reviewWithModel([item("a", "x")]);
    expect(r.findings).toEqual([]);
    expect(r.error).toMatch(/socket hang up/);
  });

  it("splits large inputs into batches of 20", async () => {
    parse.mockResolvedValue(ok([]));
    await reviewWithModel(Array.from({ length: 45 }, (_, i) => item(String(i), "m")));
    expect(parse).toHaveBeenCalledTimes(3);
  });
});
