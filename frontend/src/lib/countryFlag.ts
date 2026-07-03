/**
 * Convert an ISO 3166-1 alpha-2 country code to its flag emoji using Unicode
 * regional indicator symbols. Pure string math — works fully offline, no
 * image assets. Returns null for anything that isn't exactly two ASCII
 * letters (e.g. empty enrichment values or unexpected data).
 */
export function countryFlagEmoji(isoCode: string | null | undefined): string | null {
  if (!isoCode) return null;
  const code = isoCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - 0x41; // 'A' -> 🇦
  return String.fromCodePoint(
    code.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET,
    code.charCodeAt(1) + REGIONAL_INDICATOR_OFFSET,
  );
}

/**
 * Look up the GeoIP enrichment sibling fields for an event attribute and
 * return flag + tooltip label, or null when the attribute has no country
 * enrichment. Enrichment values are hydrated into `attributes` under
 * `enrich.<output_field>__<attr_key>` (see backend `_hydrate_enrichments`).
 */
export function geoipFlagForAttribute(
  attributes: Record<string, string | null | undefined>,
  attrKey: string,
): { flag: string; label: string } | null {
  const flag = countryFlagEmoji(attributes[`enrich.geoip_country_code__${attrKey}`]);
  if (!flag) return null;
  const country = attributes[`enrich.geoip_country__${attrKey}`] || "";
  const city = attributes[`enrich.geoip_city__${attrKey}`] || "";
  const label = [city, country].filter(Boolean).join(", ") || "GeoIP match";
  return { flag, label };
}
