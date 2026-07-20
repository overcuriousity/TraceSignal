/**
 * TemplatesView — the Templates sub-tab: structurally-distinct log-line
 * shapes (W6), browsed and muted independently of any detector run.
 *
 * Variable substrings (timestamps, UUIDs, IPs, hex, digit runs) are masked
 * server-side so e.g. 50M "Allow TCP <IP>:<PORT> -> ..." lines collapse to
 * one template while a structurally distinct line stands out. Not a scored
 * detector — a browser, sorted by shape frequency (or first/last seen).
 *
 * The analyst's verb here is **Mute**: a muted template gets a
 * `kind="routine"`, `detector="log_template"` disposition. Unlike
 * sequence_motif, membership is a direct predicate on the materialized
 * `template_hash` column — no occurrence materialization job, so muting
 * takes effect immediately (no "collapsing…" watcher needed).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Filter, Info, Undo2 } from "lucide-react";
import { anomaliesApi } from "@/api/anomalies";
import { dispositionsApi } from "@/api/dispositions";
import { useDisposition } from "@/hooks/useDisposition";
import { GuidancePanel } from "@/components/ui/GuidancePanel";
import { RefreshButton } from "./detector-shared";
import { Spinner } from "@/components/ui/Spinner";
import { truncate } from "@/lib/format";
import { fmtTimestampCompactUtc as fmtTs } from "@/lib/time";

interface Props {
  caseId: string;
  timelineId: string;
  onDrillField?: (field: string, value: string) => void;
}

const FIELD_OPTIONS = [{ value: "message", label: "Message" }];
const ORDER_OPTIONS = [
  { value: "count", label: "Most common" },
  { value: "first_seen", label: "Oldest first" },
  { value: "last_seen", label: "Newest first" },
] as const;

const TEMPLATE_VERSION = 1;

export function TemplatesView({ caseId, timelineId, onDrillField }: Props) {
  const [field, setField] = useState("message");
  const [order, setOrder] = useState<(typeof ORDER_OPTIONS)[number]["value"]>("count");
  const qc = useQueryClient();

  const { data: fieldsData } = useQuery({
    queryKey: ["anomalies", caseId, timelineId, "fields"],
    queryFn: () => anomaliesApi.fields(caseId, timelineId),
    staleTime: 5 * 60 * 1000,
  });
  const fieldOptions = useMemo(() => {
    const attrOptions = (fieldsData?.fields ?? [])
      .filter((f) => f.token.startsWith("attr:"))
      .map((f) => ({ value: f.token, label: f.token.slice(5) }));
    return [...FIELD_OPTIONS, ...attrOptions];
  }, [fieldsData]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["log-templates", caseId, timelineId, field, order],
    queryFn: () => anomaliesApi.logTemplates(caseId, timelineId, { field, order, limit: 100 }),
    staleTime: 60_000,
  });

  // Shared cache key with PatternsView's routine-dispositions query — see
  // that component's comment on why this fetches unfiltered and splits by
  // `detector` client-side rather than owning a detector-scoped key.
  const { data: routineData } = useQuery({
    queryKey: ["dispositions", caseId, timelineId, "routine"],
    queryFn: () => dispositionsApi.list(caseId, timelineId, { kind: "routine" }),
  });
  const routineRows = useMemo(
    () => (routineData?.dispositions ?? []).filter((d) => d.detector === "log_template"),
    [routineData],
  );
  const mutedIds = useMemo(() => new Set(routineRows.map((d) => d.value)), [routineRows]);

  const dispositionMut = useDisposition(caseId, timelineId);
  const unmarkMut = useMutation({
    mutationFn: (id: string) => dispositionsApi.remove(caseId, timelineId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispositions", caseId, timelineId] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    meta: { errorTitle: "Couldn't unmute template" },
  });

  const templates = data?.templates ?? [];
  const activeTemplates = templates.filter((t) => !mutedIds.has(t.template_id));
  const mutedTemplates = templates.filter((t) => mutedIds.has(t.template_id));

  return (
    <div className="space-y-3">
      <GuidancePanel id="investigate-templates" title="How template browsing works">
        <p>
          This tab <strong>collapses structurally identical log lines</strong> into
          shapes — variable parts (timestamps, IPs, UUIDs, hex, numbers) are masked, so
          50M repeats of one routine line group into one template while a genuinely odd
          line stands out.
        </p>
        <p className="mt-1">
          <strong>Mute</strong> a template you recognize as routine noise — its events
          disappear from the grid immediately (no background job), always behind a
          visible "N routine events" count. Muted templates stay listed below and can be
          unmuted anytime.
        </p>
      </GuidancePanel>

      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          Template over
        </span>
        <select
          value={field}
          onChange={(e) => setField(e.target.value)}
          className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-0.5 text-xs text-[var(--color-fg-primary)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          {fieldOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={order}
          onChange={(e) => setOrder(e.target.value as typeof order)}
          className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-0.5 text-xs text-[var(--color-fg-primary)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          {ORDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <RefreshButton isFetching={isFetching} onClick={() => refetch()} />
      </div>

      {data && (
        <div className="text-xs text-[var(--color-fg-muted)]">
          {data.total_templates.toLocaleString()} distinct template
          {data.total_templates === 1 ? "" : "s"}
          {templates.length < data.total_templates && ` — showing top ${templates.length}`}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-6">
          <Spinner size={18} />
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <div className="flex items-center gap-2 py-4 text-xs text-[var(--color-fg-muted)]">
          <Info size={13} />
          <span>No events ingested yet.</span>
        </div>
      )}

      {activeTemplates.length > 0 && (
        <div className="space-y-1.5">
          {activeTemplates.map((t) => (
            <div
              key={t.template_id}
              className="space-y-1 rounded border border-[var(--color-border)] px-2 py-1.5"
            >
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 break-all font-mono text-xs text-[var(--color-fg-primary)]">
                  {truncate(t.template, 200)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {onDrillField && (
                    <button
                      title="Filter the grid to this template"
                      className="rounded p-0.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-accent)]"
                      onClick={() => onDrillField("template_id", t.template_id)}
                    >
                      <Filter size={12} />
                    </button>
                  )}
                  <button
                    title="Mute: a routine, expected line shape — its events disappear from the grid immediately (always with a visible count). Reversible via Unmute below."
                    className="rounded p-0.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-accent)]"
                    disabled={dispositionMut.isPending}
                    onClick={() =>
                      dispositionMut.mutate({
                        kind: "routine",
                        detector: "log_template",
                        field: "template_id",
                        value: t.template_id,
                        details: {
                          template: t.template,
                          template_version: TEMPLATE_VERSION,
                          field,
                          example: t.example,
                          count_at_mute: t.count,
                        },
                      })
                    }
                  >
                    {dispositionMut.isPending ? <Spinner size={11} /> : <EyeOff size={12} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-fg-muted)]">
                <span>
                  ×<strong className="text-[var(--color-fg-secondary)]">{t.count.toLocaleString()}</strong>
                </span>
                {t.distinct_sources > 1 && <span>{t.distinct_sources} sources</span>}
                {t.first_seen && <span>first {fmtTs(t.first_seen)}</span>}
                {t.last_seen && <span>last {fmtTs(t.last_seen)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {mutedTemplates.length > 0 && (
        <div className="border-t border-[var(--color-border)] pt-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-secondary)]">
            <EyeOff size={12} />
            Muted templates ({mutedTemplates.length})
          </div>
          <div className="space-y-1">
            {mutedTemplates.map((t) => {
              const row = routineRows.find((d) => d.value === t.template_id);
              return (
                <div
                  key={t.template_id}
                  className="flex items-center gap-2 rounded border border-[var(--color-border)] px-2 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 break-all font-mono text-[var(--color-fg-secondary)]">
                    {truncate(t.template, 120)}
                  </span>
                  <span className="shrink-0 text-[var(--color-fg-muted)]">
                    ×{t.count.toLocaleString()}
                  </span>
                  {row && (
                    <button
                      title="Unmute — its events reappear in the grid immediately"
                      className="flex shrink-0 items-center gap-1 rounded p-0.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-fg-primary)]"
                      disabled={unmarkMut.isPending}
                      onClick={() => unmarkMut.mutate(row.id)}
                    >
                      {unmarkMut.isPending ? <Spinner size={11} /> : <Undo2 size={12} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-start gap-1.5 pt-1 text-xs text-[var(--color-fg-muted)]">
        <Info size={10} className="mt-0.5 shrink-0" />
        <span>
          Timestamps, UUIDs, IPs, hex runs, and numbers are masked to reveal each line's
          shape; templates are grouped and ranked by how often that shape occurs. Mute a
          template to collapse its events in the grid — the grid always shows how many
          were collapsed.
        </span>
      </div>
    </div>
  );
}
