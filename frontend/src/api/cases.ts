import { del, get, post } from "./client";
import type { Case } from "./types";

export const casesApi = {
  list: () => get<{ cases: Case[] }>("/cases/").then((r) => r.cases),

  get: (caseId: string) =>
    get<{ case: Case }>(`/cases/${caseId}`).then((r) => r.case),

  create: (name: string, description?: string, teamId?: string) =>
    post<{ case: Case }>("/cases/", { name, description, team_id: teamId }).then(
      (r) => r.case,
    ),

  delete: (caseId: string) => del<{ deleted: boolean }>(`/cases/${caseId}`),
};
