/**
 * Display text for field tokens and their values.
 *
 * Hand-written sibling of the generated `timeFields.ts`. Every chart, the
 * Visualize picker and the compare editor route their user-visible text
 * through here, so a virtual `time:` field reads as "Day of week (UTC)" with
 * values "Mon".."Sun" rather than as the raw token and "1".."7".
 *
 * The hard rule this module exists to make easy to follow: **only text nodes
 * go through it**. Keys, `scaleBand` domains, colour-map keys, sort
 * comparators and `onValueClick` payloads stay on the canonical value, which
 * is the only form that round-trips into a filter, a URL or a saved chart.
 * `timeFields.ts` says the same thing about its `display` maps.
 *
 * Two functions rather than one `label(x)`: a token and a value are both
 * `string` but inhabit different namespaces, so a single entry point would
 * type-check at every wrong call site — and the `OTHER_KEY` branch, which
 * belongs to values, would silently apply to tokens too.
 *
 * Deliberately separate from `anomalyFieldLabel` (`@/lib/format`), whose
 * `ANOMALY_FIELD_LABELS` is a hand-curated whitelist of detector-eligible
 * fields. Merging the two would make a `src/vestigo/db/_time_fields.py` edit
 * reach into the anomaly UI's text through the generator — coupling nobody
 * would predict. Note also that this deliberately does *not* strip an
 * `attr:` prefix the way `anomalyFieldLabel` does: the viz inventory can hold
 * both `attr:src_ip` and a mapped canonical `src_ip`, and stripping would
 * render them identically.
 */
import { OTHER_KEY, OTHER_LABEL } from "./colors";
import { TIME_FIELDS, timeFieldValueLabel } from "./timeFields";

/** Human label for a field token — the virtual `time:` name, else the token. */
export function fieldTokenLabel(token: string): string {
  return TIME_FIELDS[token]?.label ?? token;
}

/**
 * Human label for one value of *token*, falling back to the raw value.
 *
 * `OTHER_KEY` is resolved first and unconditionally, so the synthesized
 * "outside top-N" bucket can never be shadowed by a field whose display map
 * happens to contain that key.
 */
export function fieldValueLabel(token: string | null | undefined, value: string): string {
  if (value === OTHER_KEY) return OTHER_LABEL;
  if (!token) return value;
  return timeFieldValueLabel(token, value);
}

/**
 * `fieldValueLabel` partially applied to one field — the shape
 * `Axis`'s one-argument `labelFormat` prop wants, hoisted out of render so
 * it isn't reallocated per tick.
 */
export function valueLabeller(token: string | null | undefined): (value: string) => string {
  return (value: string) => fieldValueLabel(token, value);
}
