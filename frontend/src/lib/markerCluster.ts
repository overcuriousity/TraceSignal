/**
 * markerCluster — greedy positional clustering for histogram anomaly flags.
 *
 * Markers closer than one flag's own footprint (~0.5% of chart width) would
 * only overplot into one indistinguishable dot, so they merge into a single
 * flag carrying a count. Greedy sweep over positions sorted ascending — not
 * fixed-width bins, which split markers a hair apart when they straddle a bin
 * edge. Offscreen markers (pinned to the chart edges) cluster separately from
 * onscreen ones.
 */

export interface PlottedMarker {
  pct: number;
  offscreen: boolean;
  ts: string;
  label: string;
}

export interface MarkerCluster {
  /** Flag position: the cluster's first (leftmost) member. */
  pct: number;
  offscreen: boolean;
  /** Earliest member timestamp — click-to-zoom target. */
  ts: string;
  /** Up to `maxLabels` member labels for the tooltip. */
  labels: string[];
  count: number;
}

const MAX_LABELS = 5;

export function clusterMarkers(plotted: PlottedMarker[], thresholdPct = 0.5): MarkerCluster[] {
  const sorted = [...plotted].sort((a, b) => a.pct - b.pct);
  const clusters: MarkerCluster[] = [];
  // One open cluster per stream (onscreen/offscreen) so an offscreen marker
  // between two onscreen ones can't split their cluster.
  const open: { [k: string]: MarkerCluster | undefined } = {};
  for (const m of sorted) {
    const stream = m.offscreen ? "off" : "on";
    const cluster = open[stream];
    if (cluster && m.pct - cluster.pct <= thresholdPct) {
      cluster.count += 1;
      if (cluster.labels.length < MAX_LABELS) cluster.labels.push(m.label);
      if (m.ts < cluster.ts) cluster.ts = m.ts;
    } else {
      const next: MarkerCluster = {
        pct: m.pct,
        offscreen: m.offscreen,
        ts: m.ts,
        labels: [m.label],
        count: 1,
      };
      clusters.push(next);
      open[stream] = next;
    }
  }
  return clusters;
}
