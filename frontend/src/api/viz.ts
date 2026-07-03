import { get } from "./client";
import { serializeEventFilterParams } from "@/lib/queryParams";
import type {
  EventFilters,
  FieldNumericResponse,
  FieldTermsResponse,
  FieldTimeseriesResponse,
  VizFieldsResponse,
} from "./types";

/**
 * Field-value aggregations for the per-value histogram modal and the
 * Visualization page. Every call accepts the same `EventFilters` shape as
 * `eventsApi.list`/`eventsApi.histogram` so a chart always matches the
 * currently-filtered Explorer view.
 */
export const vizApi = {
  /** Every chartable field with distinct/coverage counts — unlike
   * `anomaliesApi.fields`, no novelty-detection heuristics are applied. */
  fields: (caseId: string, timelineId: string): Promise<VizFieldsResponse> =>
    get<VizFieldsResponse>(`/cases/${caseId}/timelines/${timelineId}/viz/fields`),

  /** Top-N value/count terms aggregation for a field. */
  fieldTerms: (
    caseId: string,
    timelineId: string,
    field: string,
    filters: EventFilters = {},
    limit = 50,
  ): Promise<FieldTermsResponse> =>
    get<FieldTermsResponse>(`/cases/${caseId}/timelines/${timelineId}/viz/field-terms`, {
      ...serializeEventFilterParams(filters),
      field,
      limit,
    }),

  /** Summary statistics + fixed-width histogram for a numeric field. */
  fieldNumeric: (
    caseId: string,
    timelineId: string,
    field: string,
    filters: EventFilters = {},
    bins = 30,
  ): Promise<FieldNumericResponse> =>
    get<FieldNumericResponse>(`/cases/${caseId}/timelines/${timelineId}/viz/field-numeric`, {
      ...serializeEventFilterParams(filters),
      field,
      bins,
    }),

  /** Per-value event counts bucketed over time (top values only). */
  fieldTimeseries: (
    caseId: string,
    timelineId: string,
    field: string,
    filters: EventFilters = {},
    buckets = 60,
    seriesLimit = 12,
  ): Promise<FieldTimeseriesResponse> =>
    get<FieldTimeseriesResponse>(`/cases/${caseId}/timelines/${timelineId}/viz/field-timeseries`, {
      ...serializeEventFilterParams(filters),
      field,
      buckets,
      series_limit: seriesLimit,
    }),
};
