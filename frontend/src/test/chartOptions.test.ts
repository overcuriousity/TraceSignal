/**
 * resolveChartOptions — the one place a ChartConfig's optional knobs become
 * concrete. Shared by the Visualize page and the agent's ChartProposalCard so
 * an agent-proposed chart and a hand-built one are the same chart; before it
 * existed the two applied different defaults.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_CHART_CONFIG, type ChartConfig } from "@/components/viz/lib/chartConfig";
import { resolveChartOptions, defaultChartTypeForScale } from "@/components/viz/lib/chartOptions";
import { chartTypesFor, SCALES } from "@/components/viz/lib/chartMeta";

const config = (patch: Partial<ChartConfig>): ChartConfig => ({
  ...DEFAULT_CHART_CONFIG,
  ...patch,
});

describe("resolveChartOptions", () => {
  it("fills every option with the analyst-facing default", () => {
    expect(resolveChartOptions(config({ chartType: "bar" }))).toEqual({
      topN: 10,
      bins: 30,
      buckets: 60,
      limitX: 10,
      limitY: 10,
      sampleLimit: 5000,
      orientation: "horizontal",
      sort: "count",
      logScale: false,
      seriesMode: "overlay",
      legend: true,
    });
  });

  it("passes explicit values through", () => {
    const resolved = resolveChartOptions(
      config({ chartType: "bar", options: { topN: 25, logScale: true, sort: "value" } }),
    );
    expect(resolved.topN).toBe(25);
    expect(resolved.logScale).toBe(true);
    expect(resolved.sort).toBe("value");
  });

  it("caps topN lower for value-over-time charts than for a bar axis", () => {
    // One line per value, so a timeseries caps at 20 where a bar caps at 50.
    expect(resolveChartOptions(config({ chartType: "line", options: { topN: 999 } })).topN).toBe(20);
    expect(
      resolveChartOptions(config({ chartType: "heatmap", options: { topN: 999 } })).topN,
    ).toBe(20);
    expect(resolveChartOptions(config({ chartType: "bar", options: { topN: 999 } })).topN).toBe(50);
  });

  it("keeps a legend explicitly turned off, rather than treating false as unset", () => {
    expect(resolveChartOptions(config({ chartType: "line", options: { legend: false } })).legend).toBe(
      false,
    );
  });

  it("keeps an explicit zero", () => {
    expect(resolveChartOptions(config({ chartType: "bar", options: { topN: 0 } })).topN).toBe(0);
  });
});

describe("defaultChartTypeForScale", () => {
  it("never lands on a field-free chart, which would drop the picked field", () => {
    // The naive `chartTypesFor(s)[0]` returns "time" for every scale, because
    // CHART_META is keyed with `time` first and it is legal under all four.
    for (const scale of SCALES) {
      expect(defaultChartTypeForScale(scale)).not.toBe("time");
      expect(defaultChartTypeForScale(scale)).not.toBe("punchcard");
    }
  });

  it("picks a chart that is legal for the scale", () => {
    for (const scale of SCALES) {
      expect(chartTypesFor(scale)).toContain(defaultChartTypeForScale(scale));
    }
  });

  it("maps the scales a time field can carry", () => {
    // time:hour_of_day / day_of_week / month / ... are ordinal.
    expect(defaultChartTypeForScale("ordinal")).toBe("bar");
    expect(defaultChartTypeForScale("nominal")).toBe("bar");
    // time:date / time:year_month are interval and string-valued, so the
    // numeric marks would render empty — heatmap plots their strings.
    expect(defaultChartTypeForScale("interval")).toBe("heatmap");
    expect(defaultChartTypeForScale("ratio")).toBe("line");
  });
});
