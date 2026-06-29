import { del, get, post } from "./client";
import type { View } from "./types";

export const viewsApi = {
  list: (caseId: string) =>
    get<{ views: View[] }>(`/cases/${caseId}/views`).then((r) => r.views),

  create: (
    caseId: string,
    name: string,
    query: string,
    filter: Record<string, unknown>,
  ) =>
    post<{ view: View }>(`/cases/${caseId}/views`, { name, query, filter }).then(
      (r) => r.view,
    ),

  delete: (caseId: string, viewId: string) =>
    del<{ deleted: boolean }>(`/cases/${caseId}/views/${viewId}`),
};
