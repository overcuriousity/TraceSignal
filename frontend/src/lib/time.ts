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

/** Format a timestamp with timezone for the detail panel. */
export function fmtTimestampFull(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = parseISO(value);
    if (!isValid(d)) return value;
    return format(d, "yyyy-MM-dd HH:mm:ss.SSS 'UTC'");
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
