import { del, get, post } from "./client";
import type { Annotation, AnnotationType } from "./types";

export const annotationsApi = {
  listForTimeline: (caseId: string, timelineId: string) =>
    get<{ annotations: Annotation[] }>(
      `/cases/${caseId}/timelines/${timelineId}/annotations`,
    ).then((r) => r.annotations),

  listForEvent: (caseId: string, timelineId: string, eventId: string) =>
    get<{ annotations: Annotation[] }>(
      `/cases/${caseId}/timelines/${timelineId}/events/${eventId}/annotations`,
    ).then((r) => r.annotations),

  create: (
    caseId: string,
    timelineId: string,
    eventId: string,
    annotation_type: AnnotationType,
    content: string,
  ) =>
    post<{ annotation: Annotation }>(
      `/cases/${caseId}/timelines/${timelineId}/events/${eventId}/annotations`,
      { annotation_type, content },
    ).then((r) => r.annotation),

  delete: (
    caseId: string,
    timelineId: string,
    eventId: string,
    annotationId: string,
  ) =>
    del<{ deleted: boolean }>(
      `/cases/${caseId}/timelines/${timelineId}/events/${eventId}/annotations/${annotationId}`,
    ),
};
