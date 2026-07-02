import { format, formatDistanceToNow, parseISO, isValid } from "date-fns";

/** Format a timestamp string for display in the event grid. */
export function fmtTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = parseISO(value);
    if (!isValid(d)) return value;
    return format(d, "yyyy-MM-dd HH:mm:ss");
  } catch {
    return value;
  }
}

/** Format a timestamp with timezone for the detail panel. Always renders in UTC. */
export function fmtTimestampFull(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = parseISO(value);
    if (!isValid(d)) return value;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const minutes = String(d.getUTCMinutes()).padStart(2, "0");
    const seconds = String(d.getUTCSeconds()).padStart(2, "0");
    const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms} UTC`;
  } catch {
    return value;
  }
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Compact UTC timestamp for anomaly-panel finding rows (e.g. "Jul 1, 14:30 UTC").
 * Always UTC, like fmtTimestampFull, for forensic reproducibility across analysts
 * in different timezones — deliberately diverges from the grid's local-time
 * fmtTimestamp. */
export function fmtTimestampCompactUtc(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = parseISO(value);
    if (!isValid(d)) return value;
    const month = MONTH_ABBR[d.getUTCMonth()];
    const day = d.getUTCDate();
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const minutes = String(d.getUTCMinutes()).padStart(2, "0");
    return `${month} ${day}, ${hours}:${minutes} UTC`;
  } catch {
    return value;
  }
}

/** Relative time ago for ingest_time / created_at. */
export function fmtRelative(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = parseISO(value);
    if (!isValid(d)) return value;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return value;
  }
}

/** Format a datetime for use as a query param (ISO 8601). */
export function toIsoParam(value: Date | null): string | undefined {
  if (!value) return undefined;
  return value.toISOString();
}

/** Parse a query param datetime string back to a Date. */
export function fromIsoParam(value: string | null): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}
