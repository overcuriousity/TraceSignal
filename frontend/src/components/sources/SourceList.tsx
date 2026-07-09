import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Database, Cpu, Download, Trash2, Clock } from "lucide-react";
import { sourcesApi } from "@/api/sources";
import { fmtRelative } from "@/lib/time";
import { fmtNum, fmtBytes, fmtParserName, truncateHash } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { UploadDialog } from "@/components/timelines/UploadDialog";
import type { Source } from "@/api/types";

interface Props {
  caseId: string;
}

/** Query roots that all reflect a source's events; every one shifts when a
 *  clock-skew offset changes, so an offset edit must invalidate them all. */
const OFFSET_AFFECTED_KEYS = new Set([
  "sources",
  "events",
  "histogram",
  "field-histogram",
  "field-histogram-total",
  "field-terms",
  "anomalies",
  "frequency",
  "novelty",
  "range",
  "charset",
  "entropy",
  "combo",
  "order",
  "similar",
  "artifacts",
]);

/** Format a signed second offset compactly, e.g. `+1h`, `-2m 30s`, `+45s`. */
function fmtOffset(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  let s = Math.abs(seconds);
  const parts: string[] = [];
  const h = Math.floor(s / 3600);
  if (h) parts.push(`${h}h`);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (m) parts.push(`${m}m`);
  s -= m * 60;
  if (s || parts.length === 0) parts.push(`${s}s`);
  return sign + parts.join(" ");
}

function SourceRow({ caseId, source }: { caseId: string; source: Source }) {
  return (
    <div className="group flex items-center gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-5 py-3 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elevated)] transition-base">
      <FileText size={16} className="shrink-0 text-[var(--color-accent)] opacity-70" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[var(--color-fg-primary)] truncate">
            {source.name}
          </span>
          {source.parser && (
            <Badge variant="muted">{fmtParserName(source.parser)}</Badge>
          )}
          {source.status !== "ready" && (
            <Badge variant="accent">
              <span className="flex items-center gap-1">
                <Spinner size={10} /> Ingesting
              </span>
            </Badge>
          )}
          {source.time_offset_seconds !== 0 && (
            <Badge variant="muted">
              <span
                className="flex items-center gap-1"
                title="Query-time clock-skew correction applied"
              >
                <Clock size={10} /> {fmtOffset(source.time_offset_seconds)}
              </span>
            </Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-[var(--color-fg-muted)]">
          <span className="flex items-center gap-1">
            <Database size={11} /> {fmtNum(source.event_count)} events
          </span>
          {source.vector_count > 0 && (
            <span className="flex items-center gap-1">
              <Cpu size={11} /> {fmtNum(source.vector_count)} vectors
            </span>
          )}
          <span>{fmtBytes(source.size_bytes)}</span>
          <span className="font-mono" title={source.file_hash}>
            {truncateHash(source.file_hash, 12)}
          </span>
          <span>Updated {fmtRelative(source.updated_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ClockOffsetControl caseId={caseId} source={source} />
        <Button variant="ghost" size="icon" asChild title="Download original file">
          <a href={sourcesApi.downloadUrl(caseId, source.id)} download>
            <Download size={14} />
          </a>
        </Button>
        <DeleteSourceButton caseId={caseId} source={source} />
      </div>
    </div>
  );
}

function ClockOffsetControl({
  caseId,
  source,
}: {
  caseId: string;
  source: Source;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(source.time_offset_seconds));

  const { mutate, isPending, error } = useMutation({
    mutationFn: (seconds: number) =>
      sourcesApi.update(caseId, source.id, seconds),
    onSuccess: () => {
      // Every timeline-scoped view (grid, histogram, detectors, similarity)
      // renders shifted timestamps now — refetch them all.
      qc.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          OFFSET_AFFECTED_KEYS.has(q.queryKey[0]),
      });
      setOpen(false);
    },
  });

  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && Number.isInteger(parsed);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(String(source.time_offset_seconds));
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Clock offset…"
          className={
            source.time_offset_seconds !== 0
              ? "text-[var(--color-accent)]"
              : undefined
          }
        >
          <Clock size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="text-xs font-semibold text-[var(--color-fg-secondary)]">
          Clock-skew correction
        </p>
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
          Shift this source's timestamps by N seconds at query time. Events are
          never modified. Use a negative value to move earlier.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Clock offset in seconds"
          />
          <span className="text-xs text-[var(--color-fg-muted)]">s</span>
        </div>
        {error && (
          <p className="mt-1 text-xs text-[var(--color-danger)]">
            {(error as Error).message}
          </p>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          {source.time_offset_seconds !== 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => mutate(0)}
            >
              Reset
            </Button>
          )}
          <Button
            size="sm"
            disabled={
              isPending ||
              !valid ||
              parsed === source.time_offset_seconds
            }
            onClick={() => mutate(parsed)}
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DeleteSourceButton({ caseId, source }: { caseId: string; source: Source }) {
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () => sourcesApi.delete(caseId, source.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources", caseId] });
      qc.invalidateQueries({ queryKey: ["timelines", caseId] });
    },
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      title="Delete source"
      disabled={isPending}
      onClick={() => mutate()}
    >
      <Trash2 size={14} className="text-[var(--color-danger)]" />
    </Button>
  );
}

export function SourceList({ caseId }: Props) {
  const { data: sources, isLoading, error } = useQuery({
    queryKey: ["sources", caseId],
    queryFn: () => sourcesApi.list(caseId),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-fg-secondary)] uppercase tracking-wider">
          Sources
        </h2>
        <UploadDialog caseId={caseId} />
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
      {sources && sources.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--color-fg-muted)]">
          No sources yet. Upload a log file to get started.
        </p>
      )}
      {sources && (
        <div className="space-y-2">
          {sources.map((source) => (
            <SourceRow key={source.id} caseId={caseId} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}
