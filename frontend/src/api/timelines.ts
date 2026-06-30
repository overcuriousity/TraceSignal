import { del, get, post } from "./client";
import type { EmbeddingFieldsResponse, EmbeddingFieldConfig, Source, Timeline } from "./types";

export const timelinesApi = {
  list: (caseId: string) =>
    get<{ timelines: Timeline[] }>(`/cases/${caseId}/timelines`).then(
      (r) => r.timelines,
    ),

  get: (caseId: string, timelineId: string) =>
    get<{ timeline: Timeline }>(
      `/cases/${caseId}/timelines/${timelineId}`,
    ).then((r) => r.timeline),

  create: (
    caseId: string,
    name: string,
    description?: string,
    sourceIds?: string[],
  ) =>
    post<{ timeline: Timeline }>(`/cases/${caseId}/timelines`, {
      name,
      description,
      source_ids: sourceIds ?? [],
    }).then((r) => r.timeline),

  delete: (caseId: string, timelineId: string) =>
    del<{ deleted: boolean }>(`/cases/${caseId}/timelines/${timelineId}`),

  listSources: (caseId: string, timelineId: string) =>
    get<{ sources: Source[] }>(
      `/cases/${caseId}/timelines/${timelineId}/sources`,
    ).then((r) => r.sources),

  addSource: (caseId: string, timelineId: string, sourceId: string) =>
    post<{ added: boolean }>(
      `/cases/${caseId}/timelines/${timelineId}/sources/${sourceId}`,
    ),

  removeSource: (caseId: string, timelineId: string, sourceId: string) =>
    del<{ removed: boolean }>(
      `/cases/${caseId}/timelines/${timelineId}/sources/${sourceId}`,
    ),

  /** Fetch per-artifact field recommendations for the timeline's embedding wizard. */
  embeddingFields: (caseId: string, timelineId: string) =>
    get<EmbeddingFieldsResponse>(
      `/cases/${caseId}/timelines/${timelineId}/embedding-fields`,
    ),

  /** Start a background job to embed all sources of a timeline. */
  embed: (caseId: string, timelineId: string, config: EmbeddingFieldConfig) =>
    post<{ job_id: string; status: string; source_ids: string[] }>(
      `/cases/${caseId}/timelines/${timelineId}/embed`,
      { embedding_config: config },
    ),
};
