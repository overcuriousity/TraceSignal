/**
 * Deterministic jitter for strip overlays.
 *
 * `Math.random` would re-roll on every render, so a chart would look
 * different each time it repainted and an SVG/PNG export would not match
 * what the analyst clicked export on. Hashing the point index instead keeps
 * the strip stable and reproducible, which is what a forensic export needs.
 *
 * The hash is an integer bit-mix (mulberry32's finalizer), not the usual
 * `sin(i * 12.9898) * 43758.5453` GLSL trick: that one is smooth in `i`, so
 * consecutive indices — which is exactly what a point strip feeds it — come
 * out correlated and the strip bands instead of scattering.
 */

/** Pseudo-random offset in [-1, 1], stable for a given index. */
export function jitterOffset(index: number): number {
  // `>>> 0` keeps every step in unsigned 32-bit space, and Math.imul does the
  // multiplies without losing the low bits to float64 rounding.
  let h = (index + 0x6d2b79f5) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1) >>> 0;
  h = (h ^ (h + Math.imul(h ^ (h >>> 7), h | 61))) >>> 0;
  return (((h ^ (h >>> 14)) >>> 0) / 0x100000000) * 2 - 1;
}
