import { get, post } from "./client";
import type {
  AnomaliesResponse,
  SimilarityResponse,
  TagAnomaliesResponse,
} from "./types";

export const similarityApi = {
  findSimilar: (
    caseId: string,
    timelineId: string,
    eventId: string,
    limit = 10,
  ) =>
    get<SimilarityResponse>(
      `/cases/${caseId}/timelines/${timelineId}/events/${eventId}/similar`,
      { limit },
    ),

  listAnomalies: (
    caseId: string,
    timelineId: string,
    limit = 50,
    sampleSize = 5000,
    normalizePerSource = false,
  ) =>
    get<AnomaliesResponse>(
      `/cases/${caseId}/timelines/${timelineId}/anomalies`,
      { limit, sample_size: sampleSize, normalize_per_source: normalizePerSource },
    ),

  tagAnomalies: (
    caseId: string,
    timelineId: string,
    limit = 50,
    sampleSize = 5000,
    normalizePerSource = false,
  ) =>
    post<TagAnomaliesResponse>(
      `/cases/${caseId}/timelines/${timelineId}/anomalies/tag`,
      { limit, sample_size: sampleSize, normalize_per_source: normalizePerSource },
    ),
};
