import { describe, it, expect } from "vitest";
import { clusterMarkers, type PlottedMarker } from "@/lib/markerCluster";

function m(pct: number, over: Partial<PlottedMarker> = {}): PlottedMarker {
  return { pct, offscreen: false, ts: "2026-07-01T00:00:00Z", label: `at ${pct}`, ...over };
}

describe("clusterMarkers", () => {
  it("merges markers a hair apart even across old bin edges", () => {
    // 0.24 and 0.26 straddle a 0.25 fixed-bin edge — must still be one cluster.
    const clusters = clusterMarkers([m(0.24), m(0.26)]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
  });

  it("keeps far-apart markers separate", () => {
    const clusters = clusterMarkers([m(10), m(20), m(30)]);
    expect(clusters).toHaveLength(3);
    expect(clusters.every((c) => c.count === 1)).toBe(true);
  });

  it("chains within the threshold but breaks past it", () => {
    // 0.0/0.4 within 0.5 of the cluster anchor; 0.9 is 0.9 from anchor 0.0 → new cluster.
    const clusters = clusterMarkers([m(0.0), m(0.4), m(0.9)]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].count).toBe(2);
    expect(clusters[1].count).toBe(1);
  });

  it("never merges offscreen with onscreen markers", () => {
    const clusters = clusterMarkers([m(0.0), m(0.1, { offscreen: true }), m(0.2)]);
    expect(clusters).toHaveLength(2);
    const on = clusters.find((c) => !c.offscreen)!;
    const off = clusters.find((c) => c.offscreen)!;
    expect(on.count).toBe(2);
    expect(off.count).toBe(1);
  });

  it("caps labels at 5 but keeps counting", () => {
    const clusters = clusterMarkers(
      Array.from({ length: 8 }, (_, i) => m(0.01 * i, { label: `l${i}` })),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(8);
    expect(clusters[0].labels).toHaveLength(5);
  });

  it("keeps the earliest timestamp as the zoom target", () => {
    const clusters = clusterMarkers([
      m(0.1, { ts: "2026-07-02T00:00:00Z" }),
      m(0.2, { ts: "2026-07-01T00:00:00Z" }),
    ]);
    expect(clusters[0].ts).toBe("2026-07-01T00:00:00Z");
  });

  it("anchors the flag at the leftmost member", () => {
    const clusters = clusterMarkers([m(5.3), m(5.1), m(5.2)]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].pct).toBe(5.1);
  });
});
