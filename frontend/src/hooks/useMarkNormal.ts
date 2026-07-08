import { useMutation, useQueryClient } from "@tanstack/react-query";
import { annotationsApi } from "@/api/annotations";
import { baselinesApi } from "@/api/baselines";
import { shouldInvalidate } from "@/hooks/useCaseStream";

/** What a single "mark normal" action needs to resolve its target. */
export interface MarkNormalTarget {
  /**
   * Detector the entry is scoped to. `"*"` = detector-agnostic (all value
   * detectors), written from a field-value row where there is no detector
   * context. A concrete detector id scopes it to that detector, written from a
   * finding row.
   */
  detector: string;
  /** Allowlist key. Omit for positional findings (timestamp_order). */
  field?: string;
  value?: string;
  /** Needed only for the per-event fallback (positional / value-less findings). */
  sourceId?: string;
  eventId?: string;
}

/**
 * Declare a value normal so detectors stop flagging it — the manual extension
 * of the baseline window (see docs/ANOMALY_DETECTION.md). Value-shaped targets
 * become a `(detector, field, value)` allowlist entry (value-level: suppressed
 * on every event); positional ones (timestamp_order, or any target missing a
 * field/value) fall back to the legacy per-event `normal` annotation.
 *
 * Shared by the field-value rows in EventDetailPanel (`detector: "*"`) and the
 * finding rows in the analysis views (detector-scoped) so both paths behave
 * identically and invalidate the same panels.
 */
export function useMarkNormal(caseId: string, timelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: MarkNormalTarget): Promise<void> => {
      if (t.field === undefined || t.value === undefined) {
        // Positional / value-less: keep the per-event annotation. Requires the
        // owning source + event to scope it — without them there is nothing to
        // mark, so surface that as an error rather than a false success.
        if (!t.sourceId || !t.eventId) {
          throw new Error("Cannot mark normal: no value key and no owning event to annotate.");
        }
        await annotationsApi.create(caseId, t.sourceId, t.eventId, "normal", "normal operation");
        return;
      }
      await baselinesApi.addAllowlist(caseId, timelineId, {
        detector: t.detector,
        field: t.field,
        value: t.value,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (query) => shouldInvalidate(query.queryKey, caseId) });
      qc.invalidateQueries({ queryKey: ["allowlist", caseId, timelineId] });
      qc.invalidateQueries({ queryKey: ["anomalies"] });
    },
  });
}
