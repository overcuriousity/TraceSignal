/**
 * Waffle-cell allocation.
 *
 * A share chart must not silently drop a category: rounding 0.4% to zero
 * cells would render an existing value invisible. So every non-empty value
 * gets one cell up front and the remaining cells are handed out by largest
 * remainder, which also guarantees the grid sums to exactly 100.
 *
 * That invariant needs more categories than cells to be impossible, and
 * "impossible" is currently only true because the terms top-N happens to cap
 * below 100. Rather than depend on a number that lives elsewhere, anything
 * past the grid's capacity is folded into the existing `Other` row here — so
 * the grid still sums to exactly 100 whatever the caller passes.
 */
import { OTHER_KEY, OTHER_LABEL } from "./colors";

const GRID = 10;
export const WAFFLE_CELLS = GRID * GRID;

export interface WaffleRow {
  key: string;
  label: string;
  count: number;
  cells: number;
}

export function allocateWaffleCells(
  rows: { key: string; label: string; count: number }[],
): WaffleRow[] {
  const positive = foldPastCapacity(rows.filter((r) => r.count > 0));
  const total = positive.reduce((s, r) => s + r.count, 0);
  if (total === 0 || positive.length === 0) return [];
  const reserved = Math.min(positive.length, WAFFLE_CELLS);
  const remaining = WAFFLE_CELLS - reserved;
  const exact = positive.map((r) => (r.count / total) * remaining);
  const floors = exact.map(Math.floor);
  let left = remaining - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const extra: number[] = new Array(positive.length).fill(0);
  for (const { i } of order) {
    if (left <= 0) break;
    extra[i] += 1;
    left -= 1;
  }
  return positive.map((r, i) => ({ ...r, cells: 1 + floors[i] + extra[i] }));
}

/**
 * Keep the largest categories the grid can actually give a cell to, and roll
 * the rest into `Other`. One cell per category is the floor, so more than
 * WAFFLE_CELLS categories cannot all be drawn — merging the tail is the only
 * option that keeps "one cell = one percent" true.
 */
function foldPastCapacity(
  rows: { key: string; label: string; count: number }[],
): { key: string; label: string; count: number }[] {
  if (rows.length <= WAFFLE_CELLS) return rows;
  const ranked = [...rows].sort((a, b) => b.count - a.count);
  const kept = ranked.slice(0, WAFFLE_CELLS - 1);
  const folded = ranked.slice(WAFFLE_CELLS - 1);
  const foldedCount = folded.reduce((s, r) => s + r.count, 0);
  // Never mutate the caller's rows — an existing Other row is replaced by a
  // copy carrying the merged count.
  if (kept.some((r) => r.key === OTHER_KEY)) {
    return kept.map((r) =>
      r.key === OTHER_KEY ? { ...r, count: r.count + foldedCount } : r,
    );
  }
  return [...kept, { key: OTHER_KEY, label: OTHER_LABEL, count: foldedCount }];
}
