/**
 * TriageBurndown — cumulative disposition verdicts over time, the team-wide
 * triage history for this timeline. Deliberately charts verdicts *recorded*
 * (by creation date of current disposition rows) rather than "outstanding
 * remaining": the finding population is a moving target (detectors re-run,
 * `normal` verdicts shrink it), so a fixed denominator would be a lie. The
 * current-state line next to the chart carries the live coverage summary.
 */
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { dispositionsApi } from "@/api/dispositions";
import { LineChart } from "@/components/viz/charts/LineChart";
import { Spinner } from "@/components/ui/Spinner";
import { useTriageCoverage } from "@/hooks/useTriageCoverage";
import { dispositionStatsToTimeseries } from "@/lib/triage-coverage";

interface Props {
  caseId: string;
  timelineId: string;
}

export function TriageBurndown({ caseId, timelineId }: Props) {
  // Keyed under the ["dispositions", caseId, timelineId] prefix so
  // useDisposition's existing invalidation refreshes this on every verdict.
  const { data, isLoading } = useQuery({
    queryKey: ["dispositions", caseId, timelineId, "stats"],
    queryFn: () => dispositionsApi.stats(caseId, timelineId),
    enabled: !!(caseId && timelineId),
  });
  const { summary } = useTriageCoverage(caseId, timelineId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size={16} />
      </div>
    );
  }
  if (!data || data.totals.total === 0) {
    return (
      <p className="flex items-center gap-1.5 py-2 text-xs text-[var(--color-fg-muted)]">
        <Info size={12} />
        No verdicts recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {summary.denominator > 0 && (
        <p className="text-[11px] text-[var(--color-fg-muted)]">
          Currently:{" "}
          <span className="font-mono font-semibold text-[var(--color-fg-secondary)]">
            {summary.anyTruncated ? "≥" : ""}
            {summary.reviewed}/{summary.denominator}
          </span>{" "}
          live findings reviewed — a moving target; detectors re-run as data and
          baselines change.
        </p>
      )}
      <LineChart data={dispositionStatsToTimeseries(data)} height={180} seriesMode="overlay" showLegend />
      <p className="flex items-start gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
        <Info size={10} className="mt-0.5 shrink-0" />
        <span>
          Cumulative verdicts recorded per day (by creation date of current
          disposition rows; deleted verdicts are not shown — the audit trail
          records deletions).
        </span>
      </p>
    </div>
  );
}
