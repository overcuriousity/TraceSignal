/**
 * VisualizePage — full statistical visualization workbench.
 *
 * Inherits the Explorer's current filters/time-range from the URL (same
 * `paramsToFilters` the Explorer itself reads), so a chart here always
 * matches whatever the analyst was just looking at in the grid. The analyst
 * picks a field, declares its scale of measurement, and gets the chart
 * types appropriate to that scale — each backed by one of the `vizApi`
 * aggregations.
 *
 * All chart state (type, field, scale, metric, comparison layer, options)
 * lives in the URL as a serialized `ChartConfig` (`c_*` params, see
 * `viz/lib/chartConfig.ts`) alongside the filter params — a Visualize URL is
 * a complete, shareable description of the chart.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { vizApi, type CompareMode } from "@/api/viz";
import { eventsApi } from "@/api/events";
import { timelinesApi } from "@/api/timelines";
import { paramsToFilters } from "@/lib/queryParams";
import { Spinner } from "@/components/ui/Spinner";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { ExportControls } from "@/components/viz/ExportControls";
import { CompareFilterEditor } from "@/components/viz/CompareFilterEditor";
import { BarChart } from "@/components/viz/charts/BarChart";
import { PieChart } from "@/components/viz/charts/PieChart";
import { NumericHistogram } from "@/components/viz/charts/NumericHistogram";
import { BoxPlot } from "@/components/viz/charts/BoxPlot";
import { ViolinPlot } from "@/components/viz/charts/ViolinPlot";
import { LineChart } from "@/components/viz/charts/LineChart";
import { Heatmap } from "@/components/viz/charts/Heatmap";
import { EcdfChart } from "@/components/viz/charts/EcdfChart";
import { CompareHistogram } from "@/components/viz/charts/CompareHistogram";
import {
  chartConfigToParams,
  paramsToChartConfig,
  type ChartConfig,
  type ChartType,
  type Scale,
} from "@/components/viz/lib/chartConfig";
import { METRIC_INFO, type Metric } from "@/components/viz/lib/transforms";
import { CHART_META, chartTypesFor, SCALES } from "@/components/viz/lib/chartMeta";
import type { CompareTimeResponse, HistogramResponse } from "@/api/types";

const SCALE_INFO: Record<Scale, { label: string; hint: string }> = {
  nominal: {
    label: "Nominal",
    hint: "Unordered categories — e.g. HTTP method, source IP, artifact type. Identity only; order carries no meaning.",
  },
  ordinal: {
    label: "Ordinal",
    hint: "Ordered categories — e.g. log level (debug < info < warning < error). Order matters, but not the distance between steps.",
  },
  interval: {
    label: "Interval",
    hint: "Numeric with meaningful differences but no true zero — e.g. a timestamp. Differences are meaningful; ratios are not.",
  },
  ratio: {
    label: "Ratio",
    hint: "Numeric with a true zero — e.g. bytes transferred, response time, request count. Differences and ratios are both meaningful.",
  },
};

const METRICS: Metric[] = ["count", "delta", "rate", "ratio", "cumulative"];

/** Adapt the single-layer histogram response to the compare shape so one
 * chart component renders both the compare-off and compare-on cases. */
function histogramToCompare(h: HistogramResponse): CompareTimeResponse {
  return {
    kind: "time",
    interval_seconds: h.interval_seconds,
    min: h.min,
    max: h.max,
    buckets: h.buckets.map((b) => ({ start: b.start, primary: b.count, comparison: 0 })),
    primary_total: h.buckets.reduce((sum, b) => sum + b.count, 0),
    comparison_total: 0,
  };
}

export function VisualizePage() {
  const { caseId, timelineId } = useParams<{ caseId: string; timelineId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => paramsToFilters(searchParams), [searchParams]);
  const config = useMemo(() => paramsToChartConfig(searchParams), [searchParams]);

  const updateConfig = useCallback(
    (patch: Partial<ChartConfig>) => {
      setSearchParams(
        (prev) => {
          const next = { ...paramsToChartConfig(prev), ...patch };
          return chartConfigToParams(next, new URLSearchParams(prev));
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const { field, scale, chartType, metric } = config;
  const dataKind = CHART_META[chartType].dataKind;
  const compareOn = config.compare.mode !== "off";
  const compareApiSpec: CompareMode | null =
    config.compare.mode === "baseline"
      ? { mode: "baseline" }
      : config.compare.mode === "custom"
        ? { mode: "custom", filters: config.compare.filters }
        : null;

  const topN = Math.min(config.options.topN ?? 10, dataKind === "timeseries" ? 20 : 50);
  const bins = config.options.bins ?? 30;
  const buckets = config.options.buckets ?? 60;

  const svgRef = useRef<SVGSVGElement | null>(null);

  const timelineQuery = useQuery({
    queryKey: ["timeline", caseId, timelineId],
    queryFn: () => timelinesApi.get(caseId!, timelineId!),
    enabled: !!(caseId && timelineId),
  });

  const fieldsQuery = useQuery({
    queryKey: ["viz-fields", caseId, timelineId],
    queryFn: () => vizApi.fields(caseId!, timelineId!),
    enabled: !!(caseId && timelineId),
  });

  // Default to the first field once the list loads — the backend sorts by
  // coverage descending, so this is the highest-coverage field.
  useEffect(() => {
    if (field == null && fieldsQuery.data?.fields.length) {
      updateConfig({ field: fieldsQuery.data.fields[0].token });
    }
  }, [field, fieldsQuery.data, updateConfig]);

  // Probe numeric-ness only when actually needed: once per field change (to
  // auto-suggest a scale) and while a numeric chart type is displayed (as its
  // data source). `autoProbedField` gates the auto-suggest to once per field
  // — the analyst's manual scale choice is never overridden afterwards.
  const autoProbedField = useRef<string | null>(field);
  const numericQuery = useQuery({
    queryKey: ["viz-field-numeric", caseId, timelineId, field, filters, bins],
    queryFn: () => vizApi.fieldNumeric(caseId!, timelineId!, field!, filters, bins),
    enabled:
      !!(caseId && timelineId && field) &&
      (dataKind === "numeric" || field !== autoProbedField.current),
  });

  useEffect(() => {
    if (!field || field === autoProbedField.current) return;
    if (numericQuery.data == null) return;
    autoProbedField.current = field;
    // Don't yank the analyst off the field-independent time chart.
    if (dataKind === "time") return;
    const isNumeric = numericQuery.data.count > 0;
    updateConfig({
      scale: isNumeric ? "ratio" : "nominal",
      chartType: isNumeric ? "histogram" : "bar",
    });
  }, [field, numericQuery.data, dataKind, updateConfig]);

  // Keep chartType valid when the analyst switches scale — clamped at event
  // time rather than in an effect, so there is never a render with an
  // inconsistent scale/chartType pair.
  const handleScaleChange = (s: Scale) => {
    if (!CHART_META[chartType].scales.includes(s)) {
      updateConfig({ scale: s, chartType: chartTypesFor(s)[0] });
    } else {
      updateConfig({ scale: s });
    }
  };

  // Metric gating: % of baseline needs a comparison layer; delta/rate/
  // cumulative need time-bucketed bins. Clamp the active metric the same way
  // so a chart-type/compare change never leaves an impossible combination.
  const metricAvailable = (m: Metric): boolean => {
    const info = METRIC_INFO[m];
    if (info.requiresCompare && !compareOn) return false;
    if (info.timeBucketedOnly && dataKind !== "time") return false;
    return m === "count" || dataKind === "time";
  };
  useEffect(() => {
    if (!metricAvailable(metric)) updateConfig({ metric: "count" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, compareOn, dataKind]);

  const termsQuery = useQuery({
    queryKey: ["viz-field-terms", caseId, timelineId, field, filters, topN],
    queryFn: () => vizApi.fieldTerms(caseId!, timelineId!, field!, filters, topN),
    enabled: !!(caseId && timelineId && field) && dataKind === "terms",
  });

  const timeseriesQuery = useQuery({
    queryKey: ["viz-field-timeseries", caseId, timelineId, field, filters, topN],
    queryFn: () => vizApi.fieldTimeseries(caseId!, timelineId!, field!, filters, 60, topN),
    enabled: !!(caseId && timelineId && field) && dataKind === "timeseries",
  });

  // Events-over-time: one shared-grid compare call when a comparison layer
  // is on, otherwise the Explorer's own histogram adapted to the same shape.
  const timeQuery = useQuery({
    queryKey: ["viz-time", caseId, timelineId, filters, config.compare, buckets],
    queryFn: async (): Promise<CompareTimeResponse> => {
      if (compareApiSpec) {
        return (await vizApi.compare(caseId!, timelineId!, {
          kind: "time",
          primary: filters,
          comparison: compareApiSpec,
          buckets,
        })) as CompareTimeResponse;
      }
      return histogramToCompare(await eventsApi.histogram(caseId!, timelineId!, filters, buckets));
    },
    enabled: !!(caseId && timelineId) && dataKind === "time",
  });

  const availableChartTypes = chartTypesFor(scale);

  const compareSummary =
    config.compare.mode === "baseline"
      ? "baseline (all timeline events, same time range)"
      : config.compare.mode === "custom"
        ? `custom (${JSON.stringify(config.compare.filters)})`
        : null;

  const captionLines = [
    `TraceVector — visualization — case ${caseId} / timeline ${timelineId ?? ""}`,
    dataKind === "time"
      ? `event count over time — ${CHART_META[chartType].label}`
      : field
        ? `field: ${field} (${scale}) — ${CHART_META[chartType].label}`
        : undefined,
    filters.q ? `search: ${filters.q}` : undefined,
    filters.start || filters.end
      ? `range: ${filters.start ?? "…"} to ${filters.end ?? "…"}`
      : undefined,
    compareSummary ? `comparison layer: ${compareSummary}` : undefined,
    dataKind === "time" && timeQuery.data
      ? `primary: ${timeQuery.data.primary_total.toLocaleString()} events` +
        (compareOn
          ? ` · comparison: ${timeQuery.data.comparison_total.toLocaleString()} events`
          : "") +
        ` · ${timeQuery.data.interval_seconds}s buckets, UTC`
      : undefined,
    metric !== "count" ? `metric: ${METRIC_INFO[metric].label} = ${METRIC_INFO[metric].formula}` : undefined,
  ].filter((l): l is string => !!l);

  const loading =
    (dataKind === "time" && timeQuery.isLoading) ||
    (dataKind === "terms" && termsQuery.isLoading) ||
    (dataKind === "numeric" && numericQuery.isLoading) ||
    (dataKind === "timeseries" && timeseriesQuery.isLoading);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Control rail */}
      <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
        <div>
          {caseId && timelineId && (
            <Link
              to={`/cases/${caseId}/timelines/${timelineId}?${searchParams.toString()}`}
              className="flex items-center gap-1 text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]"
            >
              <ArrowLeft size={12} /> Back to Explorer
            </Link>
          )}
          <h2 className="mt-1 text-sm font-semibold text-[var(--color-fg-primary)]">
            Visualize {timelineQuery.data ? `— ${timelineQuery.data.name}` : ""}
          </h2>
        </div>

        {/* Field picker */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-fg-secondary)]">
            Field
          </label>
          {dataKind === "time" ? (
            <div className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg-muted)]">
              — event count —
            </div>
          ) : (
            <Select value={field ?? undefined} onValueChange={(v) => updateConfig({ field: v })}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Choose a field…" />
              </SelectTrigger>
              <SelectContent>
                {(fieldsQuery.data?.fields ?? []).map((f) => (
                  <SelectItem key={f.token} value={f.token}>
                    {f.token}{" "}
                    <span className="text-[var(--color-fg-muted)]">
                      ({f.distinct} distinct)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Scale of measurement */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-fg-secondary)]">
            Scale of measurement
          </label>
          <div className="space-y-1">
            {SCALES.map((s) => (
              <label
                key={s}
                className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${
                  scale === s ? "bg-[var(--color-accent-dim)]" : "hover:bg-[var(--color-bg-hover)]"
                }`}
              >
                <input
                  type="radio"
                  name="scale"
                  checked={scale === s}
                  onChange={() => handleScaleChange(s)}
                  className="accent-[var(--color-accent)]"
                />
                {SCALE_INFO[s].label}
                <Tooltip content={SCALE_INFO[s].hint} side="right">
                  <HelpCircle size={12} className="text-[var(--color-fg-muted)]" />
                </Tooltip>
              </label>
            ))}
          </div>
        </div>

        {/* Chart type */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-fg-secondary)]">
            Chart type
          </label>
          <Select
            value={chartType}
            onValueChange={(v) => updateConfig({ chartType: v as ChartType })}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableChartTypes.map((c) => (
                <SelectItem key={c} value={c}>
                  {CHART_META[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Compare — supported for the time histogram (bar/numeric follow) */}
        {dataKind === "time" && (
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-[var(--color-fg-secondary)]">
              Compare
              <Tooltip
                content="Adds a second layer evaluated on the same time grid: the whole timeline (baseline) or a second filter set. Both layers always share the time range and bucket width, so they are directly comparable."
                side="right"
              >
                <HelpCircle size={12} className="text-[var(--color-fg-muted)]" />
              </Tooltip>
            </label>
            <div className="space-y-1">
              {(
                [
                  { mode: "off", label: "Off" },
                  { mode: "baseline", label: "Baseline (all events)" },
                  { mode: "custom", label: "Custom filters" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.mode}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${
                    config.compare.mode === opt.mode
                      ? "bg-[var(--color-accent-dim)]"
                      : "hover:bg-[var(--color-bg-hover)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="compare"
                    checked={config.compare.mode === opt.mode}
                    onChange={() =>
                      updateConfig({
                        compare:
                          opt.mode === "custom"
                            ? { mode: "custom", filters: {} }
                            : { mode: opt.mode },
                      })
                    }
                    className="accent-[var(--color-accent)]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {config.compare.mode === "custom" && (
              <div className="mt-2 rounded border border-[var(--color-border)] p-2">
                <CompareFilterEditor
                  filters={config.compare.filters}
                  onChange={(f) => updateConfig({ compare: { mode: "custom", filters: f } })}
                  fields={fieldsQuery.data?.fields ?? []}
                />
              </div>
            )}
          </div>
        )}

        {/* Metric */}
        {dataKind === "time" && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-fg-secondary)]">
              Metric
            </label>
            <Select
              value={metric}
              onValueChange={(v) => updateConfig({ metric: v as Metric })}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICS.filter(metricAvailable).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METRIC_INFO[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {metric !== "count" && (
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                {METRIC_INFO[metric].formula}
              </p>
            )}
            {!compareOn && (
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                Turn on Compare to unlock “% of baseline”.
              </p>
            )}
          </div>
        )}

        {/* Options */}
        {dataKind === "numeric" && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-fg-secondary)]">
              Bins: {bins}
            </label>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={bins}
              onChange={(e) =>
                updateConfig({ options: { ...config.options, bins: Number(e.target.value) } })
              }
              className="w-full accent-[var(--color-accent)]"
            />
          </div>
        )}
        {(dataKind === "terms" || dataKind === "timeseries") && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-fg-secondary)]">
              Top values: {topN}
            </label>
            <input
              type="range"
              min={3}
              max={dataKind === "timeseries" ? 20 : 50}
              step={1}
              value={topN}
              onChange={(e) =>
                updateConfig({ options: { ...config.options, topN: Number(e.target.value) } })
              }
              className="w-full accent-[var(--color-accent)]"
            />
          </div>
        )}

        <div className="mt-auto border-t border-[var(--color-border)] pt-3">
          <ExportControls
            svgRef={svgRef}
            filename={`${dataKind === "time" ? "events_over_time" : (field ?? "visualization")}_${chartType}`}
            captionLines={captionLines}
          />
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto p-4">
        {dataKind !== "time" && !field ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-fg-muted)]">
            {fieldsQuery.isLoading ? <Spinner size={20} /> : "Choose a field to visualize."}
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : (
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
            {chartType === "time" && timeQuery.data && (
              <CompareHistogram
                data={timeQuery.data}
                metric={metric}
                hasComparison={compareOn}
                svgRef={svgRef}
              />
            )}
            {chartType === "bar" && termsQuery.data && (
              <BarChart terms={termsQuery.data} svgRef={svgRef} />
            )}
            {chartType === "pie" && termsQuery.data && (
              <PieChart terms={termsQuery.data} svgRef={svgRef} />
            )}
            {chartType === "heatmap" && timeseriesQuery.data && (
              <Heatmap data={timeseriesQuery.data} svgRef={svgRef} />
            )}
            {chartType === "line" && timeseriesQuery.data && (
              <LineChart data={timeseriesQuery.data} svgRef={svgRef} />
            )}
            {chartType === "histogram" && numericQuery.data && (
              <NumericHistogram stats={numericQuery.data} svgRef={svgRef} />
            )}
            {chartType === "box" && numericQuery.data && (
              <BoxPlot stats={numericQuery.data} svgRef={svgRef} />
            )}
            {chartType === "violin" && numericQuery.data && (
              <ViolinPlot stats={numericQuery.data} svgRef={svgRef} />
            )}
            {chartType === "ecdf" && numericQuery.data && (
              <EcdfChart stats={numericQuery.data} svgRef={svgRef} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
