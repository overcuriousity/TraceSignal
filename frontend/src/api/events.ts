import { get } from "./client";
import type { EmbeddingFieldsResponse, Event, EventCursor, EventFilters, EventPage, FieldsResponse, HistogramResponse } from "./types";
import { serializeEventFilterParams } from "@/lib/queryParams";

export const eventsApi = {
  list: (
    caseId: string,
    timelineId: string,
    filters: EventFilters = {},
    signal?: AbortSignal,
    cursor?: EventCursor,
  ): Promise<EventPage> => {
    const params: Record<string, string | number | boolean | undefined | null> =
      {
        ...serializeEventFilterParams(filters),
        limit: filters.limit ?? 100,
        offset: filters.offset ?? 0,
        order: filters.order ?? "desc",
        after: cursor?.after,
        before: cursor?.before,
      };
    return get<EventPage>(
      `/cases/${caseId}/timelines/${timelineId}/events`,
      params,
      signal,
    );
  },

  /** Fetch a single full event by id — e.g. to hydrate a partial finding
   * object (analysis detectors return lightweight event stubs) before
   * displaying it in the Event Detail panel. */
  getById: async (
    caseId: string,
    timelineId: string,
    eventId: string,
  ): Promise<Event | null> => {
    const page = await get<EventPage>(
      `/cases/${caseId}/timelines/${timelineId}/events`,
      { event_id: eventId, limit: 1 },
    );
    return page.events[0] ?? null;
  },

  /** Total events matching `filters`, run server-side regardless of pagination
   * mode. Unlike `list`, whose `total` is only populated on the first
   * offset-mode page, this always resolves — so cursor/jump-to-time sessions
   * still know how many events the current filter matches (for the grid footer
   * and "select all matching" bulk actions). */
  count: (
    caseId: string,
    timelineId: string,
    filters: EventFilters = {},
    signal?: AbortSignal,
  ): Promise<{ total: number }> => {
    const params: Record<string, string | number | boolean | undefined | null> = {
      ...serializeEventFilterParams(filters),
    };
    return get<{ total: number }>(
      `/cases/${caseId}/timelines/${timelineId}/events/count`,
      params,
      signal,
    );
  },

  fields: (caseId: string, timelineId: string): Promise<FieldsResponse> =>
    get<FieldsResponse>(`/cases/${caseId}/timelines/${timelineId}/fields`),

  embeddingFields: (
    caseId: string,
    timelineId: string,
  ): Promise<EmbeddingFieldsResponse> =>
    get<EmbeddingFieldsResponse>(
      `/cases/${caseId}/timelines/${timelineId}/embedding-fields`,
    ),

  histogram: (
    caseId: string,
    timelineId: string,
    filters: EventFilters = {},
    buckets = 60,
  ): Promise<HistogramResponse> => {
    const params: Record<string, string | number | boolean | undefined | null> = {
      ...serializeEventFilterParams(filters),
      buckets,
    };
    return get<HistogramResponse>(
      `/cases/${caseId}/timelines/${timelineId}/histogram`,
      params,
    );
  },

  artifacts: (caseId: string, timelineId: string): Promise<string[]> =>
    get<{ artifacts: string[] }>(
      `/cases/${caseId}/timelines/${timelineId}/artifacts`,
    ).then((r) => r.artifacts),

  mergedTags: (caseId: string, timelineId: string): Promise<string[]> =>
    get<{ tags: string[] }>(
      `/cases/${caseId}/timelines/${timelineId}/tags/merged`,
    ).then((r) => r.tags),
};
