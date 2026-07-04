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
