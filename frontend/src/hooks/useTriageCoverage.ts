/**
 * useTriageCoverage — per-detector triage coverage for the Investigate panel.
 * Combines the shared detector sweep with the timeline's disposition rows
 * (same ["dispositions", caseId, timelineId] key ExplorerPage uses, so the
 * cache is shared and useDisposition's invalidation refreshes coverage on
 * every verdict — no extra plumbing).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dispositionsApi } from "@/api/dispositions";
import { useDetectorSweep } from "@/components/analysis/detector-hooks";
import { DETECTORS, type DetectorId } from "@/components/analysis/detector-registry";
import {
  computeDetectorCoverage,
  summarizeCoverage,
  type DetectorCoverage,
} from "@/lib/triage-coverage";

export function useTriageCoverage(caseId: string, timelineId: string) {
  const sweep = useDetectorSweep(caseId, timelineId);
  const { data: dispositionsData } = useQuery({
    queryKey: ["dispositions", caseId, timelineId],
    queryFn: () => dispositionsApi.list(caseId, timelineId),
    enabled: !!(caseId && timelineId),
  });

  return useMemo(() => {
    const dispositions = dispositionsData?.dispositions ?? [];
    const byDetector = Object.fromEntries(
      DETECTORS.map((meta) => [
        meta.id,
        computeDetectorCoverage(meta, sweep.data?.[meta.id], dispositions),
      ]),
    ) as Record<DetectorId, DetectorCoverage | null>;
    return { byDetector, summary: summarizeCoverage(byDetector) };
  }, [sweep.data, dispositionsData]);
}
