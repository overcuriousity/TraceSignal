import { get, post, postForm, put } from "./client";

export interface EnricherInfo {
  key: string;
  display_name: string;
  description: string;
  output_fields: string[];
  available: boolean;
  reason: string | null;
}

export interface TimelineEnricherInfo {
  key: string;
  display_name: string;
  description: string;
  eligible: boolean;
  sample_checked: number;
  sample_matched: number;
  mode: "automatic" | "manual";
  enabled: boolean;
}

export interface GeoipDatabaseStatus {
  uploaded: boolean;
  size_bytes: number | null;
  available: boolean;
  reason: string | null;
}

export const enrichersApi = {
  list: () =>
    get<{ enrichers: EnricherInfo[] }>("/enrichers").then((r) => r.enrichers),

  listForTimeline: (caseId: string, timelineId: string) =>
    get<{ enrichers: TimelineEnricherInfo[] }>(
      `/cases/${caseId}/timelines/${timelineId}/enrichers`,
    ).then((r) => r.enrichers),

  setConfig: (
    caseId: string,
    timelineId: string,
    key: string,
    body: { mode: "automatic" | "manual"; enabled: boolean },
  ) =>
    put(`/cases/${caseId}/timelines/${timelineId}/enrichers/${key}`, body),

  run: (caseId: string, timelineId: string, key: string) =>
    post<{ job_id: string; status: string; source_ids: string[] }>(
      `/cases/${caseId}/timelines/${timelineId}/enrichers/${key}/run`,
      {},
    ),

  geoipStatus: () => get<GeoipDatabaseStatus>("/admin/enrichers/geoip/database"),

  uploadGeoipDb: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return postForm<{ available: boolean; reason: string | null }>(
      "/admin/enrichers/geoip/database",
      form,
    );
  },
};
