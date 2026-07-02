import { fetchBlob } from "./client";
import type { ExportRequest, EventFilters } from "./types";
import { serializeEventFilterFields } from "@/lib/queryParams";

export async function downloadExport(
  caseId: string,
  timelineId: string,
  format: "csv" | "jsonl",
  filters: EventFilters,
): Promise<void> {
  const body: ExportRequest = {
    format,
    filter: {
      ...serializeEventFilterFields(filters),
      // Sent as raw objects, not JSON strings — this is already a
      // structured JSON POST body, unlike the query-param-shaped requests
      // (list/histogram/bulk-annotate) that stringify these.
      fields: filters.filters ?? {},
      exclude: filters.exclusions ?? {},
    },
  };

  const blob = await fetchBlob(
    `/cases/${caseId}/timelines/${timelineId}/export`,
    body,
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${caseId}-${timelineId}-events.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}
