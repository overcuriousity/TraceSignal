import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { similarityApi } from "@/api/similarity";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { fmtScore, truncate } from "@/lib/format";
import { fmtTimestamp } from "@/lib/time";
import type { Event } from "@/api/types";

interface Props {
  caseId: string;
  timelineId: string;
  anchorEvent: Event;
  onClose: () => void;
  onSelectEvent?: (event: Event) => void;
}

export function SimilarEvents({
  caseId,
  timelineId,
  anchorEvent,
  onClose,
  onSelectEvent,
}: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["similar", caseId, timelineId, anchorEvent.event_id],
    queryFn: () =>
      similarityApi.findSimilar(caseId, timelineId, anchorEvent.event_id, 15),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-xs font-semibold text-[var(--color-fg-secondary)] uppercase tracking-wide">
          Similar Events
        </h4>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={13} />
        </Button>
      </div>

      {/* Anchor event */}
      <div className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent-dim)] px-3 py-2 text-xs">
        <p className="text-[var(--color-fg-muted)] mb-0.5">Anchor</p>
        <p className="text-[var(--color-fg-primary)]">
          {truncate(anchorEvent.message, 120)}
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {error && (
        <p className="text-xs text-[var(--color-danger)]">{(error as Error).message}</p>
      )}
      {data?.status === "not_embedded" && (
        <p className="text-xs text-[var(--color-fg-muted)]">
          Embeddings not yet generated for this timeline.
        </p>
      )}
      {data?.status === "vector_not_found" && (
        <p className="text-xs text-[var(--color-fg-muted)]">
          No vector for this event. Has it been embedded?
        </p>
      )}
      {data?.results.map((r) => (
        <button
          key={r.event_id}
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-left hover:border-[var(--color-accent)]/40 transition-base"
          onClick={() => onSelectEvent?.(r.event)}
        >
          <div className="flex items-center gap-2 mb-0.5">
            <Badge variant="accent">sim {fmtScore(r.score)}</Badge>
            <span className="ml-auto text-xs text-[var(--color-fg-muted)] font-mono">
              {fmtTimestamp(r.event.timestamp)}
            </span>
          </div>
          <p className="text-xs text-[var(--color-fg-secondary)]">
            {truncate(r.event.message, 140)}
          </p>
        </button>
      ))}
    </div>
  );
}
