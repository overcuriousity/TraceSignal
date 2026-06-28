/**
 * TriageMeter — compact summary bar shown in the Explorer header.
 * Shows triage coverage and outlier-reviewed progress derived from annotations.
 */
import { CoverageRing } from "./CoverageRing";
import { Progress } from "@/components/ui/Progress";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Annotation } from "@/api/types";

interface Props {
  annotations: Annotation[];
  totalEvents: number;
}

function computeProgress(annotations: Annotation[]) {
  const byEvent = new Map<string, Annotation[]>();
  for (const a of annotations) {
    const list = byEvent.get(a.event_id) ?? [];
    list.push(a);
    byEvent.set(a.event_id, list);
  }

  // Annotated = events with ≥1 user annotation
  const annotatedEventIds = new Set<string>();
  for (const [eid, anns] of byEvent) {
    if (anns.some((a) => a.origin === "user")) annotatedEventIds.add(eid);
  }

  // Outlier events = those tagged by system
  const outlierEventIds = new Set<string>(
    annotations
      .filter((a) => a.annotation_type === "outlier" && a.origin === "system")
      .map((a) => a.event_id),
  );

  // Outliers reviewed = outlier events that also have a user annotation
  const outliersReviewed = [...outlierEventIds].filter((eid) =>
    (byEvent.get(eid) ?? []).some((a) => a.origin === "user"),
  ).length;

  return {
    annotated: annotatedEventIds.size,
    totalOutliers: outlierEventIds.size,
    outliersReviewed,
  };
}

export function TriageMeter({ annotations, totalEvents }: Props) {
  const { annotated, totalOutliers, outliersReviewed } =
    computeProgress(annotations);

  const outlierPct =
    totalOutliers > 0 ? Math.round((outliersReviewed / totalOutliers) * 100) : 0;

  return (
    <div className="flex items-center gap-4">
      {/* Coverage ring */}
      <Tooltip
        content={`${annotated.toLocaleString()} / ${totalEvents.toLocaleString()} events annotated`}
      >
        <div className="flex items-center gap-2">
          <CoverageRing annotated={annotated} total={totalEvents} size={36} />
          <div className="hidden sm:block">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
              Triage
            </p>
          </div>
        </div>
      </Tooltip>

      {/* Outliers meter — only shown when outliers exist */}
      {totalOutliers > 0 && (
        <Tooltip
          content={`${outliersReviewed} / ${totalOutliers} outliers reviewed`}
        >
          <div className="hidden sm:flex items-center gap-2 w-28">
            <div className="flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-muted)] mb-1">
                Outliers
              </p>
              <Progress
                value={outlierPct}
                indicatorClassName="bg-[var(--color-outlier)]"
              />
            </div>
            <span className="text-[10px] font-mono text-[var(--color-outlier)]">
              {outlierPct}%
            </span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}
