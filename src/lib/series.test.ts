import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { collapsePendingSeries } = await import("./data");

const row = (id: string, status: string, start: string, series: string | null = null) =>
  ({ id, status, start_at: start, end_at: start, series_id: series, series_index: null, series_size: null }) as never;

describe("collapsePendingSeries", () => {
  it("shows a pending weekly request as one card with the week count and last date", () => {
    const out = collapsePendingSeries([
      row("a2", "pending", "2026-10-08T21:00:00Z", "s"),
      row("x", "scheduled", "2026-10-02T21:00:00Z"),
      row("a1", "pending", "2026-10-01T21:00:00Z", "s"),
      row("a3", "pending", "2026-10-15T21:00:00Z", "s"),
    ]) as unknown as { id: string; pending_weeks?: number; pending_until?: string }[];
    expect(out.map((r) => r.id)).toEqual(["x", "a1"]);
    expect(out[1].pending_weeks).toBe(3);
    expect(out[1].pending_until).toBe("2026-10-15T21:00:00Z");
  });

  it("keeps booked weeks of a series as separate lessons", () => {
    const out = collapsePendingSeries([row("b1", "scheduled", "2026-10-01T21:00:00Z", "t"), row("b2", "scheduled", "2026-10-08T21:00:00Z", "t")]);
    expect(out).toHaveLength(2);
  });
});
