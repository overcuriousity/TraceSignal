import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { enrichersApi, type TimelineEnricherInfo } from "@/api/enrichers";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useJobsStore } from "@/stores/jobs";
import { toast } from "@/stores/toasts";
import type { Timeline } from "@/api/types";

interface Props {
  caseId: string;
  timeline: Timeline;
}

/**
 * Per-timeline enricher configuration: enable/disable, automatic vs. manual
 * trigger mode, and a manual "Run now". Only enrichers that currently pass
 * their availability check are listed at all — an unavailable enricher (e.g.
 * GeoIP with no uploaded database) simply does not appear.
 */
export function EnrichersDialog({ caseId, timeline }: Props) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const addJob = useJobsStore((s) => s.addJob);

  const queryKey = ["timeline-enrichers", caseId, timeline.id] as const;
  const configMutationKey = ["enricher-config", caseId, timeline.id] as const;

  const { data: enrichers, isLoading } = useQuery({
    queryKey,
    queryFn: () => enrichersApi.listForTimeline(caseId, timeline.id),
    enabled: open,
  });

  // Optimistic update: patch the cached list synchronously in onMutate so a
  // rapid toggle-then-mode-change reads the fresh value instead of the stale
  // pre-mutation snapshot (lost-update race).
  const configMutation = useMutation({
    mutationKey: configMutationKey,
    mutationFn: (vars: { key: string; mode: "automatic" | "manual"; enabled: boolean }) =>
      enrichersApi.setConfig(caseId, timeline.id, vars.key, {
        mode: vars.mode,
        enabled: vars.enabled,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<TimelineEnricherInfo[]>(queryKey);
      qc.setQueryData<TimelineEnricherInfo[]>(queryKey, (old) =>
        old?.map((e) =>
          e.key === vars.key ? { ...e, mode: vars.mode, enabled: vars.enabled } : e,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => {
      // Only refetch after the last in-flight config mutation settles, so an
      // earlier response doesn't clobber a later optimistic patch.
      if (qc.isMutating({ mutationKey: configMutationKey }) === 1) {
        qc.invalidateQueries({ queryKey });
      }
    },
    meta: { errorTitle: "Enricher config change failed" },
  });

  const runMutation = useMutation({
    mutationFn: (key: string) => enrichersApi.run(caseId, timeline.id, key),
    onSuccess: (res, key) => {
      // Skipped run: every ready source already enriched at the current config
      // (same enricher + data version), so no job started — say so instead of
      // letting the click look like it did nothing.
      if (res.job_id === null) {
        toast.info(
          `${key}: already enriched`,
          "Every ready source is up to date — no job started.",
        );
        return;
      }
      addJob(res.job_id, `${key} enrichment`, [
        ["events", caseId, timeline.id],
        ["fields", caseId, timeline.id],
      ]);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Enrichers">
          <Sparkles size={14} />
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Enrichers"
        description="Derive additional fields from this timeline's events. Enrichers not listed here are currently unavailable — an admin may need to enable a required asset."
        className="max-w-xl"
      >
        <div className="space-y-3">
          {isLoading && <p className="text-xs text-[var(--color-fg-muted)]">Loading…</p>}
          {enrichers?.length === 0 && (
            <p className="text-xs text-[var(--color-fg-muted)]">
              No enrichers are currently available for this timeline.
            </p>
          )}
          {enrichers?.map((e) => (
            <EnricherRow
              key={e.key}
              enricher={e}
              onToggle={(enabled) =>
                configMutation.mutate({ key: e.key, mode: e.mode, enabled })
              }
              onModeChange={(mode) =>
                configMutation.mutate({ key: e.key, mode, enabled: e.enabled })
              }
              onRun={() => runMutation.mutate(e.key)}
              isRunning={runMutation.isPending && runMutation.variables === e.key}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EnricherRow({
  enricher,
  onToggle,
  onModeChange,
  onRun,
  isRunning,
}: {
  enricher: TimelineEnricherInfo;
  onToggle: (enabled: boolean) => void;
  onModeChange: (mode: "automatic" | "manual") => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-fg-primary)]">
            {enricher.display_name}
          </p>
          <p className="text-xs text-[var(--color-fg-muted)]">{enricher.description}</p>
        </div>
        <Switch checked={enricher.enabled} onCheckedChange={onToggle} />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-fg-muted)]">
        <span>
          {enricher.eligible
            ? "Matching field values found in this timeline's sources"
            : "No matching field values found in this timeline's sources"}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={enricher.mode}
            onValueChange={(v) => onModeChange(v as "automatic" | "manual")}
            disabled={!enricher.enabled}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="automatic">Automatic</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            disabled={!enricher.enabled || !enricher.eligible || isRunning}
            onClick={onRun}
          >
            {isRunning ? "Running…" : "Run now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
