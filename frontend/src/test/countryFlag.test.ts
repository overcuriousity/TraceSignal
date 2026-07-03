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
    "enrich.geoip_country_code__src_ip": "US",
    "enrich.geoip_country__src_ip": "United States",
    "enrich.geoip_city__src_ip": "Mountain View",
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
      geoipFlagForAttribute({ "enrich.geoip_country_code__ip": "DE" }, "ip"),
    ).toEqual({ flag: "🇩🇪", label: "GeoIP match" });
  });
});
