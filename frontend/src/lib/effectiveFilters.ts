/**
 * Effective-filter composition for the Explorer.
 *
 * The Explorer keeps two parallel layers of filter state:
 *   1. URL-backed `EventFilters` (shareable, saved-view reproducible).
 *   2. Session overlays that are *deliberately* never serialized to the URL or
 *      saved views (`anomalyRunId`, `ids`, `collapseRoutine` — see the field
 *      docs in `api/types.ts`): run-scoped detector membership, an event_id
 *      allowlist (semantic-search results or an agent finding), and the
 *      routine-collapse toggle. These are forensic/session concerns and/or
 *      unboundedly large (id lists), so URL-encoding them is off the table.
 *
 * `computeEffectiveFilters` merges the two into the single object actually
 * sent to the events / histogram / export queries. Extracted here (rather than
 * left inline in ExplorerPage) so the agent finding-apply seam can be unit
 * tested end-to-end: a finding's FilterSpec must reproduce *exactly* the filter
 * set the agent ran (agent invariant, `src/vestigo/agent/tools.py`).
 */
import type { EventFilters } from "@/api/types";

/** The session overlays merged on top of the URL-backed filters. */
export interface ExplorerOverlays {
  /** Persisted detector run whose findings scope the "anomaly" annotation branch. */
  anomalyRunId?: string;
  /** Agent-applied event_id allowlist (from a finding's `event_ids`). */
  appliedIds: string[] | null;
  /** Semantic-search result ids (query-derived; replaces the keyword `q`). */
  semanticSearchIds: string[] | null;
  /** Routine-motif collapse toggle. */
  collapseRoutine: boolean;
}

/**
 * Merge URL-backed `filters` with the session `overlays` into the filter set
 * actually queried. `filters` itself stays URL-serializable/shareable — this
 * only augments it while the relevant overlay is active.
 *
 * Precedence for the `ids` allowlist: an explicit agent-applied allowlist wins
 * over semantic-search results (applying a finding is a deliberate action and
 * its allowlist is authoritative); the semantic path additionally drops `q`
 * because a semantically relevant event need not literally contain the words.
 */
export function computeEffectiveFilters(
  filters: EventFilters,
  overlays: ExplorerOverlays,
): EventFilters {
  let f = filters;
  // run_id only means anything when the "anomaly" branch is active — the
  // backend (events.py `_resolve_annotated_event_ids`) only unions the run's
  // findings in when `annotated` includes "anomaly".
  if (filters.annotated?.includes("anomaly") && overlays.anomalyRunId) {
    f = { ...f, anomalyRunId: overlays.anomalyRunId };
  }
  if (overlays.appliedIds !== null) {
    f = { ...f, ids: overlays.appliedIds };
  } else if (overlays.semanticSearchIds !== null) {
    f = { ...f, q: undefined, ids: overlays.semanticSearchIds };
  }
  if (overlays.collapseRoutine) {
    f = { ...f, collapseRoutine: true };
  }
  return f;
}

/**
 * Decompose an applied filter set (e.g. from `specToEventFilters` on an agent
 * finding) into the session overlays that carry its non-URL-serialized fields.
 * The apply handler feeds the returned values into the overlay setters so the
 * grid reflects the whole finding, not just the URL-backed subset.
 */
export function overlaysFromApplied(f: EventFilters): {
  anomalyRunId: string | undefined;
  ids: string[] | null;
  collapseRoutine: boolean;
} {
  return {
    anomalyRunId: f.anomalyRunId,
    ids: f.ids && f.ids.length > 0 ? f.ids : null,
    collapseRoutine: !!f.collapseRoutine,
  };
}
