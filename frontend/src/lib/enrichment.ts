/**
 * Frontend side of the enrichment derived-key contract and the (small)
 * registry of per-enricher cell decorations.
 *
 * Derived attribute keys follow `<attr_key>:<output_field>` (e.g.
 * `src_ip:geo_country`), written by the backend enrichment job — the
 * canonical definition lives in `src/tracesignal/enrichers/base.py`
 * (`FIELD_KEY_SEPARATOR` / `derived_field_key`); keep the two in sync.
 */

import { countryFlagEmoji } from "./countryFlag";

export const FIELD_KEY_SEPARATOR = ":";

/** Build the derived-attribute key for one enrichment output. */
export function derivedFieldKey(attrKey: string, outputField: string): string {
  return `${attrKey}${FIELD_KEY_SEPARATOR}${outputField}`;
}

export interface DerivedKeyParts {
  parent: string;
  field: string;
}

/**
 * Split a derived attribute key into its parent attribute and output field,
 * or null when the key has no separator (a plain attribute). Splits on the
 * *last* separator so a parent that itself contains one (rare, but raw keys
 * are vendor-controlled) resolves correctly — callers deciding grouping
 * should additionally check the parent actually exists in the field list.
 */
export function splitDerivedKey(key: string): DerivedKeyParts | null {
  const idx = key.lastIndexOf(FIELD_KEY_SEPARATOR);
  if (idx <= 0 || idx === key.length - 1) return null;
  return { parent: key.slice(0, idx), field: key.slice(idx + 1) };
}

type Attributes = Record<string, string | null | undefined>;

/**
 * Whether any enricher produced output for this attribute on this row —
 * i.e. a `<attrKey>:` sibling key exists. Used to gate enrichment-driven
 * visuals so they truthfully reflect what was enriched, rather than firing
 * on value shape alone.
 */
export function hasEnrichmentSiblings(attributes: Attributes, attrKey: string): boolean {
  const prefix = attrKey + FIELD_KEY_SEPARATOR;
  return Object.keys(attributes).some((key) => key.startsWith(prefix));
}

export interface AttributeDecoration {
  flag: string;
  label: string;
}

/**
 * Per-enricher cell decorators, tried in order. Deliberately a plain internal
 * list rather than a plugin API — extend it here when a new enricher needs a
 * visual treatment in the Explorer.
 */
const DECORATORS: Array<(attributes: Attributes, attrKey: string) => AttributeDecoration | null> =
  [
    // GeoIP: country flag + "city, country" tooltip from the geo_* siblings.
    (attributes, attrKey) => {
      const flag = countryFlagEmoji(attributes[derivedFieldKey(attrKey, "geo_country_code")]);
      if (!flag) return null;
      const country = attributes[derivedFieldKey(attrKey, "geo_country")] || "";
      const city = attributes[derivedFieldKey(attrKey, "geo_city")] || "";
      const label = [city, country].filter(Boolean).join(", ") || "GeoIP match";
      return { flag, label };
    },
  ];

/** Decoration for an attribute's cell (flag + tooltip), or null when no enricher output applies. */
export function getAttributeDecoration(
  attributes: Attributes,
  attrKey: string,
): AttributeDecoration | null {
  for (const decorate of DECORATORS) {
    const decoration = decorate(attributes, attrKey);
    if (decoration) return decoration;
  }
  return null;
}
