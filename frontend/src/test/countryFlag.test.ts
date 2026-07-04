import { describe, expect, it } from "vitest";
import { countryFlagEmoji, geoipFlagForAttribute } from "@/lib/countryFlag";

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

describe("geoipFlagForAttribute", () => {
  const attributes = {
    src_ip: "8.8.8.8",
    "src_ip:geo_country_code": "US",
    "src_ip:geo_country": "United States",
    "src_ip:geo_city": "Mountain View",
    dst_ip: "10.0.0.1",
  };

  it("returns flag and city/country label for an enriched attribute", () => {
    expect(geoipFlagForAttribute(attributes, "src_ip")).toEqual({
      flag: "🇺🇸",
      label: "Mountain View, United States",
    });
  });

  it("returns null when the attribute has no country-code enrichment", () => {
    expect(geoipFlagForAttribute(attributes, "dst_ip")).toBeNull();
  });

  it("falls back to a generic label when only the code is present", () => {
    expect(
      geoipFlagForAttribute({ "ip:geo_country_code": "DE" }, "ip"),
    ).toEqual({ flag: "🇩🇪", label: "GeoIP match" });
  });
});
