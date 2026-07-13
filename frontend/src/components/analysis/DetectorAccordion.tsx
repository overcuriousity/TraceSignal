/**
 * DetectorAccordion — the per-detector "Advanced" view: every detector is one
 * row with a live finding count, grouped into three categories (Values /
 * Volume & timing / Sequences); expanding a row drills into that detector's
 * full ranked findings inline, with its field pickers and tuning knobs.
 *
 * The count badges come from the shared detector sweep (useDetectorSweep) —
 * the same fetch that powers the unified FindingsFeed, so opening Advanced
 * costs nothing extra. Only the expanded detector's view mounts, so exactly
 * one detector publishes histogram markers / run-id at a time, and collapsing
 * all clears the overlay.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { DETECTOR_CATEGORIES, DETECTORS, type DetectorId } from "./detector-registry";
import { useDetectorSweep } from "./detector-hooks";
import { ValueNoveltyView } from "./ValueNoveltyView";
import { ComboNoveltyView } from "./ComboNoveltyView";
import { FrequencyView } from "./FrequencyView";
import { OrderViolationsView } from "./OrderViolationsView";
import { NumericRangeView } from "./NumericRangeView";
import { CharsetNoveltyView } from "./CharsetNoveltyView";
import { EntropyView } from "./EntropyView";
import { ProportionShiftView } from "./ProportionShiftView";
import { IntervalPeriodicityView } from "./IntervalPeriodicityView";
import { DistributionDriftView } from "./DistributionDriftView";
import { EventSequenceView } from "./EventSequenceView";
import { cn } from "@/lib/cn";
import type { AnomalyMarker, Event } from "@/api/types";

interface Props {
  caseId: string;
  timelineId: string;
  onSelectEvent: (event: Event) => void;
  onDrillField?: (field: string, value: string) => void;
  onComboDrill?: (pairs: [string, string][]) => void;
  onFrequencyDrill?: (field: string, value: string, start: string, end: string) => void;
  onAnomalyMarkers?: (markers: AnomalyMarker[]) => void;
  onAnomalyRunId?: (runId: string | undefined) => void;
  onJumpToTime?: (ts: string, eventId?: string, windowEnd?: string) => void;
}

export function DetectorAccordion(props: Props) {
  const { caseId, timelineId } = props;
  const [open, setOpen] = useState<DetectorId | null>(null);

  const sweep = useDetectorSweep(caseId, timelineId);
  const needsBaseline = sweep.needsBaseline;

  return (
    <div className="rounded border border-[var(--color-border)]">
      {DETECTOR_CATEGORIES.map((cat) => (
        <div key={cat.id}>
          <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-base)] px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
              {cat.label}
            </span>
          </div>
          {DETECTORS.filter((d) => d.category === cat.id).map((d) => {
            const isOpen = open === d.id;
            const response = sweep.data?.[d.id];
            const count =
              response === undefined ? undefined : response === null ? -1 : response.results.length;
            return (
              <div key={d.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <button
                  onClick={() => setOpen(isOpen ? null : d.id)}
                  className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-[var(--color-bg-hover)]"
                >
                  {isOpen ? (
                    <ChevronDown size={13} className="shrink-0 text-[var(--color-fg-muted)]" />
                  ) : (
                    <ChevronRight size={13} className="shrink-0 text-[var(--color-fg-muted)]" />
                  )}
                  <d.icon size={13} className="shrink-0 text-[var(--color-fg-muted)]" />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="text-xs font-medium text-[var(--color-fg-primary)]">{d.label}</span>
                    {!isOpen && (
                      <span className="truncate text-[10px] text-[var(--color-fg-muted)]">{d.hint}</span>
                    )}
                  </span>
                  <CountBadge
                    count={needsBaseline ? undefined : count}
                    loading={sweep.isFetching && count === undefined}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-2.5">
                    <DetectorBody id={d.id} {...props} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CountBadge({ count, loading }: { count?: number; loading: boolean }) {
  if (loading) return <Spinner size={11} />;
  if (count === undefined) return <span className="text-[10px] text-[var(--color-fg-muted)]">—</span>;
  if (count < 0) return <span className="text-[10px] text-[var(--color-warning)]">err</span>;
  return (
    <span
      className={cn(
        "min-w-[1.25rem] rounded px-1 py-0.5 text-center font-mono text-[11px] font-semibold",
        count > 0
          ? "bg-[var(--color-anomaly-dim)] text-[var(--color-anomaly)]"
          : "text-[var(--color-fg-muted)]",
      )}
    >
      {count}
    </span>
  );
}

/** Renders the one expanded detector's full view. */
function DetectorBody({ id, ...props }: Props & { id: DetectorId }) {
  const shared = {
    caseId: props.caseId,
    timelineId: props.timelineId,
    onSelectEvent: props.onSelectEvent,
    onFindingsChange: props.onAnomalyMarkers,
    onRunIdChange: props.onAnomalyRunId,
    onJumpToTime: props.onJumpToTime,
  };
  switch (id) {
    case "novelty":
      return <ValueNoveltyView {...shared} onDrillField={props.onDrillField} />;
    case "combo":
      return <ComboNoveltyView {...shared} onComboDrill={props.onComboDrill} />;
    case "frequency":
      return <FrequencyView {...shared} onDrillField={props.onFrequencyDrill} />;
    case "shift":
      return <ProportionShiftView {...shared} onDrillField={props.onDrillField} />;
    case "interval":
      return <IntervalPeriodicityView {...shared} onDrillField={props.onDrillField} />;
    case "drift":
      return <DistributionDriftView {...shared} onDrillField={props.onDrillField} />;
    case "sequence":
      return <EventSequenceView {...shared} />;
    case "order":
      return <OrderViolationsView {...shared} />;
    case "range":
      return <NumericRangeView {...shared} onDrillField={props.onDrillField} />;
    case "charset":
      return <CharsetNoveltyView {...shared} onDrillField={props.onDrillField} />;
    case "entropy":
      return <EntropyView {...shared} onDrillField={props.onDrillField} />;
  }
}
