import { describe, it, expect } from "vitest";
import { truncateHash, fmtBytes, fmtNum, fmtPct, truncate } from "@/lib/format";

describe("truncateHash", () => {
  it("returns em-dash for null/undefined", () => {
    expect(truncateHash(null)).toBe("—");
    expect(truncateHash(undefined)).toBe("—");
  });
  it("truncates long hashes", () => {
    const hash = "abc123def456xyz";
    expect(truncateHash(hash, 8)).toBe("abc123de…");
  });
  it("returns short values unchanged", () => {
    expect(truncateHash("abc", 12)).toBe("abc");
  });
});

describe("fmtBytes", () => {
  it("formats bytes", () => {
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(2048)).toBe("2.0 KB");
    expect(fmtBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(fmtBytes(2 * 1024 ** 3)).toBe("2.00 GB");
  });
});

describe("fmtNum", () => {
  it("adds thousands separators", () => {
    expect(fmtNum(1000000)).toMatch(/1[,.]000[,.]000/);
  });
});

describe("fmtPct", () => {
  it("formats ratio as percentage", () => {
    expect(fmtPct(0.5)).toBe("50.0%");
    expect(fmtPct(1)).toBe("100.0%");
    expect(fmtPct(0)).toBe("0.0%");
  });
});

describe("truncate", () => {
  it("leaves short strings alone", () => {
    expect(truncate("hello", 120)).toBe("hello");
  });
  it("truncates long strings with ellipsis", () => {
    const long = "a".repeat(200);
    const out = truncate(long, 120);
    expect(out.length).toBe(121); // 120 + "…"
    expect(out.endsWith("…")).toBe(true);
  });
});
