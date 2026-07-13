import { describe, it, expect } from "vitest";
import { formatRoutineStat } from "@/lib/format";

describe("formatRoutineStat", () => {
  it("renders count with percent of timeline", () => {
    // count formatting is locale-dependent (toLocaleString) — assert around it
    expect(formatRoutineStat(2500, 10000)).toBe(
      `${(2500).toLocaleString()} routine events hidden (25% of timeline)`,
    );
  });

  it("omits percent when timeline total unknown", () => {
    expect(formatRoutineStat(42, 0)).toBe("42 routine events hidden");
  });

  it("uses singular for one event", () => {
    expect(formatRoutineStat(1, 100)).toBe("1 routine event hidden (1% of timeline)");
  });

  it("keeps sub-1% shares from rounding to 0%", () => {
    expect(formatRoutineStat(3, 10000)).toBe(
      "3 routine events hidden (<0.1% of timeline)",
    );
    expect(formatRoutineStat(50, 10000)).toBe(
      "50 routine events hidden (0.5% of timeline)",
    );
  });

  it("shows 0% only for a true zero count", () => {
    expect(formatRoutineStat(0, 10000)).toBe(
      "0 routine events hidden (0.0% of timeline)",
    );
  });
});
