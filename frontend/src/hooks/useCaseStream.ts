import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "") + "/api";

/** Query key prefixes that reflect annotation/tag state and should be
 * refetched the moment any team member changes them. Kept in one place so
 * the invalidation logic mirrors ExplorerPage's actual query keys. */
const INVALIDATE_PREFIXES = ["annotations", "tags", "tags-merged"];

/**
 * Subscribes to the case's live-collaboration SSE stream and invalidates the
 * relevant TanStack Query caches whenever another team member changes
 * annotations/tags, so the event grid, tag chips, and tag autocomplete stay
 * in sync across analysts without a manual refresh or waiting for the
 * existing 30s poll (see `annotations` query in ExplorerPage).
 *
 * Advisory only: the SSE payload carries just IDs, never event content — the
 * actual data is always re-fetched through the normal authorized endpoints.
 */
export function useCaseStream(caseId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!caseId) return;

    const source = new EventSource(`${API_BASE}/cases/${caseId}/stream`, {
      withCredentials: true,
    });

    source.onmessage = (event) => {
      if (!event.data) return; // keepalive comment lines don't reach onmessage
      try {
        const payload = JSON.parse(event.data) as { type?: string };
        if (payload.type === "annotation.changed") {
          queryClient.invalidateQueries({
            predicate: (query) =>
              INVALIDATE_PREFIXES.includes(query.queryKey[0] as string) &&
              query.queryKey[1] === caseId,
          });
        }
      } catch {
        // Malformed event — ignore rather than crash the subscription.
      }
    };

    // EventSource auto-reconnects on transient errors by design; nothing to
    // do here beyond letting the browser retry (server sends `retry: 3000`).
    source.onerror = () => {};

    return () => source.close();
  }, [caseId, queryClient]);
}
