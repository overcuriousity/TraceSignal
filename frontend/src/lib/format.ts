/** Formatting helpers for forensic data. */

/** Truncate a hash/UUID for compact display. */
export function truncateHash(value: string | null | undefined, len = 12): string {
  if (!value) return "—";
  return value.length > len ? value.slice(0, len) + "…" : value;
}

/** Format a byte size as a human-readable string. */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Format a number with thousands separators. */
export function fmtNum(n: number): string {
  return n.toLocaleString();
}

/** Format a percentage to 1 decimal. */
export function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Truncate a long string with an ellipsis. */
export function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "…";
}

/** Turn a parser name slug into a readable label. */
export function fmtParserName(name: string | null | undefined): string {
  if (!name) return "—";
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a cosine distance score to 4 decimal places. */
export function fmtScore(score: number): string {
  return score.toFixed(4);
}
