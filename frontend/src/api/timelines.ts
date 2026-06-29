import { del, get, post } from "./client";
import type { Source, Timeline } from "./types";

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
};
