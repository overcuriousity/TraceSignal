import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Tag } from "lucide-react";
import { similarityApi } from "@/api/similarity";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { fmtScore, truncate } from "@/lib/format";
import { fmtTimestamp } from "@/lib/time";
import type { Event } from "@/api/types";

interface Props {
  caseId: string;
  timelineId: string;
  onSelectEvent?: (event: Event) => void;
}

export function AnomaliesList({ caseId, timelineId, onSelectEvent }: Props) {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["anomalies", caseId, timelineId],
    queryFn: () => similarityApi.listAnomalies(caseId, timelineId, 50, 5000),
    staleTime: 60_000,
  });

  const { mutate: tagAnomalies, isPending: isTagging } = useMutation({
    mutationFn: () => similarityApi.tagAnomalies(caseId, timelineId, 50, 5000),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["annotations", caseId, timelineId] });
      qc.invalidateQueries({ queryKey: ["anomalies", caseId, timelineId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-[var(--color-danger)]">{(error as Error).message}</p>
    );
  }

  if (!data || data.status === "not_embedded") {
    return (
      <p className="text-xs text-[var(--color-fg-muted)]">
        Embeddings required for anomaly detection.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Framing note */}
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-base)] px-3 py-2 text-xs text-[var(--color-fg-muted)]">
        <AlertTriangle size={11} className="inline mr-1 text-[var(--color-warning)]" />
        These are <strong className="text-[var(--color-fg-secondary)]">statistically rare</strong>{" "}
        events, not confirmed threats. Use for triage, not attribution.
        <br />
        Sample: {data.sample_size.toLocaleString()} events · Algorithm: centroid distance
      </div>

      {/* Tag all button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={isTagging}
        onClick={() => tagAnomalies()}
      >
        {isTagging ? <Spinner size={13} /> : <Tag size={13} />}
        {isTagging ? "Tagging…" : "Persist as Outlier Annotations"}
      </Button>

      {/* Results */}
      <div className="space-y-1.5">
        {data.results.map((r) => (
          <button
            key={r.event_id}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-left hover:border-[var(--color-outlier)]/40 hover:bg-[var(--color-outlier-dim)] transition-base"
            onClick={() => onSelectEvent?.(r.event)}
          >
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outlier">
                dist {fmtScore(r.details.distance)}
              </Badge>
              <span className="text-xs text-[var(--color-fg-muted)] font-mono">
                rank {r.details.rank}/{r.details.of}
              </span>
              <span className="ml-auto text-xs text-[var(--color-fg-muted)] font-mono">
                {fmtTimestamp(r.event.timestamp)}
              </span>
            </div>
            <p className="text-xs text-[var(--color-fg-secondary)] leading-relaxed">
              {truncate(r.event.message, 160)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
