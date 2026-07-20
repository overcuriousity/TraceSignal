/**
 * ChartProposalCard — renders an agent `propose_chart` tool call as a live
 * chart card: title, explanation, the chart itself (fetched fresh through
 * the same `vizApi` the Visualize page uses, not the tool_result echo — see
 * module doc below), "Open in Visualize" and "Save".
 *
 * Sandbox + apply model, same as FindingCard: the agent never writes
 * anything. "Save" is the analyst's own click against the existing
 * `savedChartsApi.create` — the only write in this flow, credited to the
 * analyst, mirroring how `propose_finding`'s "Apply to Explorer" is the
 * analyst's own action.
 *
 * Live fetch (not the tool_result summary echo) keeps the chart consistent
 * with the analyst's current data/dispositions — the summary the tool returned
 * is a validation receipt for the model, not a display value, and is
 * deliberately not shown here.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ExternalLink, Save } from "lucide-react";
import { vizApi, savedChartsApi, type CompareMode } from "@/api/viz";
import { eventsApi } from "@/api/events";
import {
  chartConfigToParams,
  chartConfigToStored,
  histogramToCompare,
} from "@/components/viz/lib/chartConfig";
import { CHART_META } from "@/components/viz/lib/chartMeta";
import { BarChart } from "@/components/viz/charts/BarChart";
import { NumericHistogram } from "@/components/viz/charts/NumericHistogram";
import { LineChart } from "@/components/viz/charts/LineChart";
import { CompareHistogram } from "@/components/viz/charts/CompareHistogram";
import { PunchCard } from "@/components/viz/charts/PunchCard";
import { PivotHeatmap } from "@/components/viz/charts/PivotHeatmap";
import { ScatterChart } from "@/components/viz/charts/ScatterChart";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Markdown } from "./Markdown";
import { specToChartConfig, specToEventFilters, type AgentChartSpec } from "@/api/agent";
import { filtersToParams } from "@/lib/queryParams";
import type {
  CompareNumericResponse,
  CompareTermsResponse,
  CompareTimeResponse,
} from "@/api/types";

interface Props {
  caseId: string;
  timelineId: string;
  title: string;
  description: string;
  spec: AgentChartSpec;
}

export function ChartProposalCard({ caseId, timelineId, title, description, spec }: Props) {
  const config = useMemo(() => specToChartConfig(spec), [spec]);
  const filters = useMemo(() => specToEventFilters(spec.filters ?? {}), [spec]);
  const dataKind = CHART_META[config.chartType].dataKind;
  const compareOn = config.compare.mode !== "off";
  const compareApiSpec: CompareMode | null =
    config.compare.mode === "custom" ? { mode: "custom", filters: config.compare.filters } : null;

  // Every kind but time/punchcard needs a field, and pivot/scatter need two.
  // `propose_chart` rejects an incomplete spec before a card is ever shown, so
  // this should be unreachable — but an un-run query renders as neither
  // loading nor error, i.e. a silently blank chart box, so say so explicitly
  // rather than leave the analyst looking at nothing.
  const specComplete =
    dataKind === "time" || dataKind === "punchcard"
      ? true
      : dataKind === "pivot" || dataKind === "scatter"
        ? !!(config.field && config.fieldY)
        : !!config.field;

  const chartQuery = useQuery({
    queryKey: ["agent-chart", caseId, timelineId, config, filters],
    queryFn: async () => {
      switch (dataKind) {
        case "terms":
          if (compareApiSpec) {
            return {
              kind: "terms" as const,
              compare: true as const,
              data: (await vizApi.compare(caseId, timelineId, {
                kind: "terms",
                field: config.field!,
                primary: filters,
                comparison: compareApiSpec,
                limit: config.options.topN,
              })) as CompareTermsResponse,
            };
          }
          return {
            kind: "terms" as const,
            compare: false as const,
            data: await vizApi.fieldTerms(caseId, timelineId, config.field!, filters, config.options.topN),
          };
        case "numeric":
          if (compareApiSpec) {
            return {
              kind: "numeric" as const,
              compare: true as const,
              data: (await vizApi.compare(caseId, timelineId, {
                kind: "numeric",
                field: config.field!,
                primary: filters,
                comparison: compareApiSpec,
                bins: config.options.bins,
              })) as CompareNumericResponse,
            };
          }
          return {
            kind: "numeric" as const,
            compare: false as const,
            data: await vizApi.fieldNumeric(caseId, timelineId, config.field!, filters, config.options.bins),
          };
        case "timeseries":
          return {
            kind: "timeseries" as const,
            data: await vizApi.fieldTimeseries(
              caseId,
              timelineId,
              config.field!,
              filters,
              config.options.buckets,
              config.options.topN,
            ),
          };
        case "time": {
          const data = compareApiSpec
            ? ((await vizApi.compare(caseId, timelineId, {
                kind: "time",
                primary: filters,
                comparison: compareApiSpec,
                buckets: config.options.buckets,
              })) as CompareTimeResponse)
            : histogramToCompare(
                await eventsApi.histogram(caseId, timelineId, filters, config.options.buckets),
              );
          return { kind: "time" as const, data };
        }
        case "punchcard":
          return { kind: "punchcard" as const, data: await vizApi.punchcard(caseId, timelineId, filters) };
        case "pivot":
          return {
            kind: "pivot" as const,
            data: await vizApi.fieldPivot(
              caseId,
              timelineId,
              config.field!,
              config.fieldY!,
              filters,
              config.options.limitX,
              config.options.limitY,
            ),
          };
        case "scatter":
          return {
            kind: "scatter" as const,
            data: await vizApi.fieldScatter(
              caseId,
              timelineId,
              config.field!,
              config.fieldY!,
              filters,
              config.options.sampleLimit,
            ),
          };
      }
    },
    enabled: specComplete,
  });

  const qc = useQueryClient();
  const [name, setName] = useState("");
  const saveMutation = useMutation({
    mutationFn: () =>
      savedChartsApi.create(caseId, timelineId, name.trim(), chartConfigToStored(config)),
    onSuccess: () => {
      setName("");
      // Same key SavedChartsRail reads, so an open Visualize page picks the
      // new chart up instead of showing a stale rail.
      qc.invalidateQueries({ queryKey: ["viz-saved-charts", caseId, timelineId] });
    },
  });

  const openParams = chartConfigToParams(config, filtersToParams(filters));
  const openHref = `/cases/${caseId}/timelines/${timelineId}/visualize?${openParams.toString()}`;

  return (
    <div className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-dim)] p-2.5 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-[var(--color-fg-primary)]">
        <BarChart3 size={13} className="shrink-0 text-[var(--color-accent)]" />
        <span className="min-w-0 break-words">{title}</span>
      </div>
      {description && (
        <div className="mt-1 text-[var(--color-fg-secondary)]">
          <Markdown content={description} />
        </div>
      )}

      <div className="mt-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-2">
        {!specComplete && (
          <p className="py-2 text-[var(--color-fg-muted)]">
            This chart proposal is missing a field, so there is nothing to plot.
          </p>
        )}
        {chartQuery.isLoading && (
          <div className="flex items-center justify-center py-6">
            <Spinner size={16} />
          </div>
        )}
        {chartQuery.isError && (
          <p className="py-2 text-[var(--color-danger)]">
            Couldn't load this chart:{" "}
            {chartQuery.error instanceof Error ? chartQuery.error.message : "unknown error"}
          </p>
        )}
        {chartQuery.data?.kind === "terms" && (
          <BarChart
            terms={chartQuery.data.compare ? undefined : chartQuery.data.data}
            compare={chartQuery.data.compare ? chartQuery.data.data : undefined}
          />
        )}
        {chartQuery.data?.kind === "numeric" && (
          <NumericHistogram
            stats={chartQuery.data.compare ? undefined : chartQuery.data.data}
            compare={chartQuery.data.compare ? chartQuery.data.data : undefined}
          />
        )}
        {chartQuery.data?.kind === "timeseries" && <LineChart data={chartQuery.data.data} />}
        {chartQuery.data?.kind === "time" && (
          <CompareHistogram data={chartQuery.data.data} metric="count" hasComparison={compareOn} />
        )}
        {chartQuery.data?.kind === "punchcard" && <PunchCard data={chartQuery.data.data} />}
        {chartQuery.data?.kind === "pivot" && <PivotHeatmap data={chartQuery.data.data} />}
        {chartQuery.data?.kind === "scatter" && <ScatterChart data={chartQuery.data.data} />}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() && !saveMutation.isPending) {
                saveMutation.mutate();
              }
            }}
            placeholder="Save as…"
            className="h-6 w-28 text-[11px]"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5"
            disabled={!name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            aria-label="Save chart"
          >
            {saveMutation.isPending ? <Spinner size={11} /> : <Save size={12} />}
          </Button>
          {saveMutation.isSuccess && (
            <span className="text-[10px] text-[var(--color-success)]">Saved</span>
          )}
        </div>
        <Button variant="accent" size="sm" asChild>
          <Link to={openHref}>
            Open in Visualize
            <ExternalLink size={12} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
