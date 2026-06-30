import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, Cpu } from "lucide-react";
import { timelinesApi } from "@/api/timelines";
import { fmtRelative } from "@/lib/time";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { CreateTimelineDialog } from "./CreateTimelineDialog";
import { DeleteTimelineDialog } from "./DeleteTimelineDialog";
import { EmbedWizard } from "./EmbedWizard";
import type { Timeline } from "@/api/types";

interface Props {
  caseId: string;
}

function EmbeddingBadge({ tl }: { tl: Timeline }) {
  if (!tl.is_embedded) {
    return (
      <Badge variant="muted" className="flex items-center gap-1">
        <Cpu size={9} /> Not embedded
      </Badge>
    );
  }
  if (tl.is_stale) {
    return (
      <Badge
        variant="muted"
        className="flex items-center gap-1 border-[var(--color-warning)]/40 text-[var(--color-warning)]"
      >
        <Cpu size={9} /> Stale
      </Badge>
    );
  }
  return (
    <Badge variant="accent" className="flex items-center gap-1">
      <Cpu size={9} /> Embedded
    </Badge>
  );
}

function TimelineRow({ caseId, tl }: { caseId: string; tl: Timeline }) {
  return (
    <div className="group flex items-center gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-5 py-3 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elevated)] transition-base">
      <Clock size={16} className="shrink-0 text-[var(--color-info)] opacity-70" />
      <Link
        to={`/cases/${caseId}/timelines/${tl.id}`}
        className="flex-1 min-w-0"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[var(--color-fg-primary)] truncate">
            {tl.name}
          </span>
          {tl.is_default && <Badge variant="accent">default</Badge>}
          <EmbeddingBadge tl={tl} />
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-[var(--color-fg-muted)]">
          <span>{tl.source_ids.length} source{tl.source_ids.length !== 1 ? "s" : ""}</span>
          {tl.is_stale && (
            <span className="text-[var(--color-warning)]">
              Sources changed — re-embed to update analysis
            </span>
          )}
          {!tl.is_stale && tl.embedded_at && (
            <span>Embedded {fmtRelative(tl.embedded_at)}</span>
          )}
          <span>Updated {fmtRelative(tl.updated_at)}</span>
        </div>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        {tl.source_ids.length > 0 && (
          <EmbedWizard caseId={caseId} timeline={tl} />
        )}
        {!tl.is_default && <DeleteTimelineDialog caseId={caseId} timeline={tl} />}
      </div>
    </div>
  );
}

export function TimelineList({ caseId }: Props) {
  const { data: timelines, isLoading, error } = useQuery({
    queryKey: ["timelines", caseId],
    queryFn: () => timelinesApi.list(caseId),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-fg-secondary)] uppercase tracking-wider">
          Timelines
        </h2>
        <CreateTimelineDialog caseId={caseId} />
      </div>
      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}
      {error && (
        <p className="text-sm text-[var(--color-danger)]">
          {(error as Error).message}
        </p>
      )}
      {timelines && timelines.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--color-fg-muted)]">
          No timelines yet. Create one to group sources.
        </p>
      )}
      {timelines && (
        <div className="space-y-2">
          {timelines.map((tl) => (
            <TimelineRow key={tl.id} caseId={caseId} tl={tl} />
          ))}
        </div>
      )}
    </div>
  );
}
