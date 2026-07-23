/**
 * The teaching copy is only useful if it is complete and actually reachable:
 * every chart type needs a "how to read this", every explainer id referenced
 * by a component must exist, and no entry may quietly lose a section.
 */
import { describe, it, expect } from "vitest";
import {
  CHART_HOW_TO_READ,
  EXPLAINERS,
  type ExplainerId,
} from "@/components/viz/lib/explainers";
import { CHART_META } from "@/components/viz/lib/chartMeta";

// Vite's raw glob rather than node:fs — the frontend tsconfig carries no node
// types, and this keeps the scan inside the bundler's module graph.
const VIZ_SOURCES = {
  ...(import.meta.glob("../components/viz/**/*.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../pages/VisualizePage.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

describe("explainer copy", () => {
  it("covers every chart type with a how-to-read line", () => {
    expect(Object.keys(CHART_HOW_TO_READ).sort()).toEqual(Object.keys(CHART_META).sort());
    for (const [chartType, line] of Object.entries(CHART_HOW_TO_READ)) {
      expect(line.length, chartType).toBeGreaterThan(20);
    }
  });

  it("gives every explainer all three sections", () => {
    for (const [id, explainer] of Object.entries(EXPLAINERS)) {
      expect(explainer.title, id).toBeTruthy();
      expect(explainer.what, id).toBeTruthy();
      expect(explainer.howToRead, id).toBeTruthy();
      // "When to distrust it" is the section that keeps these honest — a
      // statistic explained without its failure mode teaches overconfidence.
      expect(explainer.distrust, id).toBeTruthy();
    }
  });

  it("has an entry for every id a component asks for", () => {
    expect(usedExplainerIds().size).toBeGreaterThan(0);
    for (const id of usedExplainerIds()) {
      expect(EXPLAINERS[id as ExplainerId], `${id} is used but has no copy`).toBeTruthy();
    }
  });

  // The converse direction, and the one that actually bites: σ shipped with
  // no explainer beside it while mean/median/skewness all had one. Copy that
  // nothing renders teaches nobody — an unreferenced entry means either a
  // statistic is displayed bare, or the copy is dead weight.
  it("renders every explainer it defines", () => {
    const used = usedExplainerIds();
    for (const id of Object.keys(EXPLAINERS)) {
      expect(used.has(id), `${id} has copy but no component shows it`).toBe(true);
    }
  });
});

/**
 * Ids a component actually shows. Literal `id="mean"` is the common form, but
 * `ScatterStatsPanel` and `CorrMatrix` pass the id through a variable
 * (`id={r.explainer}`, `id={corrMethod}`), so a literal-only scan would call
 * pearson/spearman/kendall unrendered when they are on screen. Any quoted
 * occurrence of a known id in a viz source counts as a reference — loose on
 * purpose: this guards against copy nothing displays, not against typos,
 * which the `ExplainerId` type already catches at compile time.
 */
function usedExplainerIds(): Set<string> {
  const used = new Set<string>();
  const known = Object.keys(EXPLAINERS);
  for (const source of Object.values(VIZ_SOURCES)) {
    for (const match of source.matchAll(/ExplainerPopover\s+id="([^"]+)"/g)) {
      used.add(match[1]);
    }
    for (const id of known) {
      if (source.includes(`"${id}"`)) used.add(id);
    }
  }
  return used;
}
