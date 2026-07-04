import { describe, expect, it } from "vitest";
import { countryFlagEmoji } from "@/lib/countryFlag";

describe("countryFlagEmoji", () => {
  it("converts ISO alpha-2 codes to regional-indicator emoji", () => {
    expect(countryFlagEmoji("DE")).toBe("🇩🇪");
    expect(countryFlagEmoji("us")).toBe("🇺🇸");
    expect(countryFlagEmoji(" fr ")).toBe("🇫🇷");
  });

  it("returns null for missing or malformed codes", () => {
    expect(countryFlagEmoji(null)).toBeNull();
    expect(countryFlagEmoji(undefined)).toBeNull();
    expect(countryFlagEmoji("")).toBeNull();
    expect(countryFlagEmoji("D")).toBeNull();
    expect(countryFlagEmoji("DEU")).toBeNull();
    expect(countryFlagEmoji("1A")).toBeNull();
  });
});
