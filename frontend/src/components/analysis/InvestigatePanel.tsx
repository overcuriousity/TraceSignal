/**
 * InvestigatePanel — the single right-hand investigation surface, replacing the
 * old sibling AnalysisPanel + BaselineManager. It reads top-to-bottom as one
 * workflow:
 *
 *   1. Frame bar   — pick the global scope (scan all events / compare baseline).
 *   2. Detectors   — run-all summary + a per-detector findings view; every
 *                    detector obeys the frame (no per-view mode toggle).
 *   3. Windows &   — build/select baseline definitions (typed or dragged) and
 *      normality     manage the value allowlist ("Normal values").
 *
 * Similarity and Method stay as sibling top tabs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Hash,
  Layers,
  Rewind,
  Ruler,
  Search,
  Shuffle,
  SlidersHorizontal,
  Type,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { ValueNoveltyView } from "./ValueNoveltyView";
import { ComboNoveltyView } from "./ComboNoveltyView";
import { FrequencyView } from "./FrequencyView";
import { OrderViolationsView } from "./OrderViolationsView";
import { NumericRangeView } from "./NumericRangeView";
import { CharsetNoveltyView } from "./CharsetNoveltyView";
import { EntropyView } from "./EntropyView";
import { SimilarEvents } from "./SimilarEvents";
import { SemanticSearch } from "./SemanticSearch";
import { EmbeddingStatusBanner } from "./EmbeddingStatusBanner";
import { MethodologyPanel } from "./MethodologyPanel";
import { DetectorSummaryStrip } from "./DetectorSummaryStrip";
import { FrameBar } from "./FrameBar";
import { WindowsNormality } from "./WindowsNormality";
import { timelinesApi } from "@/api/timelines";
import { useUiStore } from "@/stores/ui";
import { useBaselineStore } from "@/stores/baseline";
import { cn } from "@/lib/cn";
import type { AnomalyMarker, Event } from "@/api/types";

type Tab = "anomalies" | "similar" | "methodology";
type AnomalySubTab = "novelty" | "combo" | "frequency" | "order" | "range" | "charset" | "entropy";

const DETECTORS: { id: AnomalySubTab; icon: React.ElementType; label: string; description: string }[] = [
  { id: "novelty", icon: Hash, label: "Rare values", description: "Rare or first-seen field values" },
  { id: "combo", icon: Layers, label: "Value combos", description: "Rare combinations of two or more fields" },
  { id: "frequency", icon: Activity, label: "Frequency", description: "Event-count spikes and silences per series" },
  { id: "order", icon: Rewind, label: "Timestamp order", description: "Timestamps running backwards in record order" },
  { id: "range", icon: Ruler, label: "Numeric range", description: "Numeric values outside a learned band" },
  { id: "charset", icon: Type, label: "Charset novelty", description: "Values containing never-seen characters" },
  { id: "entropy", icon: Shuffle, label: "Entropy outliers", description: "Random-looking or degenerate strings" },
];

interface Props {
  caseId: string;
  timelineId: string;
  hasVectors: boolean;
  similarAnchor: Event | null;
  onClose: () => void;
  onSelectEvent: (event: Event) => void;
  onSimilarClose: () => void;
  onDrillField?: (field: string, value: string) => void;
  onComboDrill?: (pairs: [string, string][]) => void;
  onFrequencyDrill?: (field: string, value: string, start: string, end: string) => void;
  onAnomalyMarkers?: (markers: AnomalyMarker[]) => void;
  onAnomalyRunId?: (runId: string | undefined) => void;
  onJumpToTime?: (ts: string, eventId?: string, windowEnd?: string) => void;
}

export function InvestigatePanel({
  caseId,
  timelineId,
  hasVectors,
  similarAnchor,
  onClose,
  onSelectEvent,
  onSimilarClose,
  onDrillField,
  onComboDrill,
  onFrequencyDrill,
  onAnomalyMarkers,
  onAnomalyRunId,
  onJumpToTime,
}: Props) {
  const [tab, setTab] = useState<Tab>(similarAnchor ? "similar" : "anomalies");
  const [anomalySubTab, setAnomalySubTab] = useState<AnomalySubTab>("novelty");
  const [windowsOpen, setWindowsOpen] = useState(false);

  useEffect(() => {
    if (similarAnchor) setTab("similar");
  }, [similarAnchor]);

  // Marking on the histogram (arming a window row, or the histogram's own mark
  // cursor) should reveal the editor so the brushed range has somewhere to land.
  const markMode = useBaselineStore((s) => s.markMode);
  useEffect(() => {
    if (markMode) {
      setTab("anomalies");
      setWindowsOpen(true);
    }
  }, [markMode]);

  const { data: timeline } = useQuery({
    queryKey: ["timeline", caseId, timelineId],
    queryFn: () => timelinesApi.get(caseId, timelineId),
    refetchInterval: 30_000,
  });
  const { data: sources } = useQuery({
    queryKey: ["timeline-sources", caseId, timelineId],
    queryFn: () => timelinesApi.listSources(caseId, timelineId),
  });

  const showBanner = !hasVectors || (timeline?.is_stale ?? false);

  // ── Resize drag (mirrors EventDetailPanel) ─────────────────────────────
  const { analysisPanelWidth, setAnalysisPanelWidth } = useUiStore();
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = { startX: e.clientX, startWidth: analysisPanelWidth };
    },
    [analysisPanelWidth],
  );
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragState.current) return;
      const delta = dragState.current.startX - e.clientX;
      setAnalysisPanelWidth(Math.max(320, Math.min(720, dragState.current.startWidth + delta)));
    }
    function onMouseUp() {
      dragState.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [setAnalysisPanelWidth]);

  const detectorViewProps = {
    caseId,
    timelineId,
    onSelectEvent,
    onFindingsChange: onAnomalyMarkers,
    onRunIdChange: onAnomalyRunId,
    onJumpToTime,
  };

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-surface)]"
      style={{ width: analysisPanelWidth }}
    >
      <div
        onMouseDown={onDragStart}
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-[var(--color-accent)] transition-opacity z-10"
        style={{ marginLeft: -2 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="flex-1 text-sm font-semibold text-[var(--color-fg-primary)]">Investigate</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>

      {/* Top-level tabs */}
      <div className="flex border-b border-[var(--color-border)]">
        {(
          [
            ["anomalies", AlertTriangle, "Anomalies"],
            ["similar", Search, "Similarity"],
            ["methodology", BookOpen, "Method"],
          ] as [Tab, React.ElementType, string][]
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-base border-b-2",
              tab === id
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg-secondary)]",
            )}
            onClick={() => setTab(id)}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Detector selector (anomalies tab only) */}
      {tab === "anomalies" && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-base)] px-2 py-1.5">
          <Select value={anomalySubTab} onValueChange={(v) => setAnomalySubTab(v as AnomalySubTab)}>
            <SelectTrigger className="h-7 px-2 text-xs" aria-label="Detector">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DETECTORS.map((d) => (
                <SelectItem key={d.id} value={d.id} className="h-auto py-1.5">
                  <span className="flex items-center gap-1.5">
                    <d.icon size={11} className="shrink-0 text-[var(--color-fg-muted)]" />
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-xs font-medium">{d.label}</span>
                      <span className="text-[10px] text-[var(--color-fg-muted)]">{d.description}</span>
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "anomalies" && (
          <>
            <FrameBar
              caseId={caseId}
              timelineId={timelineId}
              onBuildBaseline={() => setWindowsOpen(true)}
            />

            <DetectorSummaryStrip caseId={caseId} timelineId={timelineId} onSelect={setAnomalySubTab} />

            {anomalySubTab === "novelty" && (
              <ValueNoveltyView {...detectorViewProps} onDrillField={onDrillField} />
            )}
            {anomalySubTab === "combo" && (
              <ComboNoveltyView {...detectorViewProps} onComboDrill={onComboDrill} />
            )}
            {anomalySubTab === "frequency" && (
              <FrequencyView {...detectorViewProps} onDrillField={onFrequencyDrill} />
            )}
            {anomalySubTab === "order" && <OrderViolationsView {...detectorViewProps} />}
            {anomalySubTab === "range" && (
              <NumericRangeView {...detectorViewProps} onDrillField={onDrillField} />
            )}
            {anomalySubTab === "charset" && (
              <CharsetNoveltyView {...detectorViewProps} onDrillField={onDrillField} />
            )}
            {anomalySubTab === "entropy" && (
              <EntropyView {...detectorViewProps} onDrillField={onDrillField} />
            )}

            {/* Windows & normality */}
            <div className="mt-5 border-t border-[var(--color-border)] pt-3">
              <button
                onClick={() => setWindowsOpen((v) => !v)}
                className="mb-2 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]"
              >
                {windowsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <SlidersHorizontal size={12} />
                Windows &amp; normality
              </button>
              {windowsOpen && <WindowsNormality caseId={caseId} timelineId={timelineId} />}
            </div>
          </>
        )}

        {tab === "similar" && (
          <div className="space-y-5">
            {showBanner && (
              <EmbeddingStatusBanner
                status={hasVectors ? "ok" : "not_embedded"}
                timeline={timeline ?? null}
                caseId={caseId}
              />
            )}
            <SemanticSearch caseId={caseId} timelineId={timelineId} onSelectEvent={onSelectEvent} />
            <div className="border-t border-[var(--color-border)] pt-4">
              {similarAnchor ? (
                <SimilarEvents
                  caseId={caseId}
                  timelineId={timelineId}
                  anchorEvent={similarAnchor}
                  onClose={onSimilarClose}
                  onSelectEvent={onSelectEvent}
                />
              ) : (
                <p className="text-xs text-[var(--color-fg-muted)]">
                  Click the search icon on any event row to find similar events.
                </p>
              )}
            </div>
          </div>
        )}

        {tab === "methodology" && (
          <MethodologyPanel
            caseId={caseId}
            timelineId={timelineId}
            timeline={timeline}
            sources={sources ?? []}
          />
        )}
      </div>
    </div>
  );
}
