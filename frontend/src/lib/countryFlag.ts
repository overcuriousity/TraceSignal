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
 * enrichment. Enrichment lives directly in `attributes` under the derived-key
 * contract `<attr_key>:<output_field>` (e.g. `src_ip:geo_country`), written
 * by the backend enrichment job (see enrichers/jobs.py `_process_batch`).
 */
export function geoipFlagForAttribute(
  attributes: Record<string, string | null | undefined>,
  attrKey: string,
): { flag: string; label: string } | null {
  const flag = countryFlagEmoji(attributes[`${attrKey}:geo_country_code`]);
  if (!flag) return null;
  const country = attributes[`${attrKey}:geo_country`] || "";
  const city = attributes[`${attrKey}:geo_city`] || "";
  const label = [city, country].filter(Boolean).join(", ") || "GeoIP match";
  return { flag, label };
}
