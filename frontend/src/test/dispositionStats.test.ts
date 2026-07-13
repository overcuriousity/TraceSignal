import { describe, it, expect } from "vitest";
import { dispositionStatsToTimeseries } from "@/lib/triage-coverage";
import type { DispositionStatsDay, DispositionStatsResponse } from "@/api/types";

function day(
  date: string,
  counts: Partial<Record<"normal" | "dismissed" | "confirmed" | "routine", number>>,
  cumulative: DispositionStatsDay["cumulative"],
): DispositionStatsDay {
  const c = { normal: 0, dismissed: 0, confirmed: 0, routine: 0, ...counts };
  return { date, ...c, total: c.normal + c.dismissed + c.confirmed + c.routine, cumulative };
}

describe("dispositionStatsToTimeseries", () => {
  it("returns empty series for empty input", () => {
    const stats: DispositionStatsResponse = {
      days: [],
      totals: { normal: 0, dismissed: 0, confirmed: 0, routine: 0, total: 0 },
    };
    const ts = dispositionStatsToTimeseries(stats);
    expect(ts.series).toEqual([]);
    expect(ts.min).toBeNull();
  });

  it("zero-fills gap days carrying the cumulative total forward", () => {
    const stats: DispositionStatsResponse = {
      days: [
        day(
          "2026-07-01",
          { dismissed: 2 },
          { normal: 0, dismissed: 2, confirmed: 0, routine: 0, total: 2 },
        ),
        day(
          "2026-07-04",
          { dismissed: 1, confirmed: 1 },
          { normal: 0, dismissed: 3, confirmed: 1, routine: 0, total: 4 },
        ),
      ],
      totals: { normal: 0, dismissed: 3, confirmed: 1, routine: 0, total: 4 },
    };
    const ts = dispositionStatsToTimeseries(stats);
    // 4 daily buckets, UTC midnight
    const dismissed = ts.series.find((s) => s.value === "dismissed")!;
    expect(dismissed.buckets.map((b) => b.start)).toEqual([
      "2026-07-01T00:00:00.000Z",
      "2026-07-02T00:00:00.000Z",
      "2026-07-03T00:00:00.000Z",
      "2026-07-04T00:00:00.000Z",
    ]);
    // cumulative, gap days carry previous total
    expect(dismissed.buckets.map((b) => b.count)).toEqual([2, 2, 2, 3]);
    const confirmed = ts.series.find((s) => s.value === "confirmed")!;
    expect(confirmed.buckets.map((b) => b.count)).toEqual([0, 0, 0, 1]);
    expect(ts.interval_seconds).toBe(86_400);
    expect(ts.min).toBe("2026-07-01T00:00:00.000Z");
    expect(ts.max).toBe("2026-07-04T00:00:00.000Z");
  });

  it("emits one series per verdict kind", () => {
    const stats: DispositionStatsResponse = {
      days: [
        day(
          "2026-07-01",
          { normal: 1 },
          { normal: 1, dismissed: 0, confirmed: 0, routine: 0, total: 1 },
        ),
      ],
      totals: { normal: 1, dismissed: 0, confirmed: 0, routine: 0, total: 1 },
    };
    const ts = dispositionStatsToTimeseries(stats);
    expect(ts.series.map((s) => s.value)).toEqual([
      "normal",
      "dismissed",
      "confirmed",
      "routine",
    ]);
  });
});
