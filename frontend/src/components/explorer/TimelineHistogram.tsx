/**
 * TimelineHistogram — compact event-count bar chart above the event grid.
 *
 * Fetches /histogram (respects all active filters so the chart always mirrors
 * the current view).  Click a bar to zoom to that time bucket; drag across
 * bars to select a time span.
 *
 * No chart dependency — hand-rolled div bars (airgap-safe).
 *
 * Brush state uses refs (not React state) so mouseup reliably reads the
 * current selection even when no re-render has occurred since mousedown.
 */
import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventsApi } from "@/api/events";
import { Spinner } from "@/components/ui/Spinner";
import type { EventFilters, HistogramBucket } from "@/api/types";
import { cn } from "@/lib/cn";

interface Props {
  caseId: string;
  timelineId: string;
  filters: EventFilters;
  onRangeSelect: (start: string, end: string) => void;
}

/** Add `seconds` to an ISO string and return a UTC ISO string. */
function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

/** Short, human-readable label for a UTC ISO datetime string. */
function fmtShort(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function TimelineHistogram({ caseId, timelineId, filters, onRangeSelect }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["histogram", caseId, timelineId, filters],
    queryFn: () => eventsApi.histogram(caseId, timelineId, filters),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Brush indices are kept in refs so handleMouseUp always reads the latest
  // values synchronously, even before React commits a re-render from mousedown.
  const brushStartRef = useRef<number | null>(null);
  const brushEndRef = useRef<number | null>(null);
  const isDragging = useRef(false);

  // Only the visual highlight and tooltip need state (drives re-renders).
  const [brushRange, setBrushRange] = useState<{ lo: number; hi: number } | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    text: string;
  } | null>(null);

  const buckets = data?.buckets ?? [];
  const maxCount = Math.max(1, ...buckets.map((b: HistogramBucket) => b.count));

  const applyBrush = useCallback(
    (startIdx: number, endIdx: number) => {
      if (!data || buckets.length === 0) return;
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      const startBucket = buckets[lo];
      const endBucket = buckets[hi];
      if (!startBucket || !endBucket) return;
      const start = startBucket.start;
      const end = addSeconds(endBucket.start, data.interval_seconds);
      onRangeSelect(start, end);
    },
    [buckets, data, onRangeSelect],
  );

  const handleMouseDown = useCallback((idx: number) => {
    isDragging.current = true;
    brushStartRef.current = idx;
    brushEndRef.current = idx;
    setBrushRange({ lo: idx, hi: idx });
  }, []);

  const handleMouseEnter = useCallback(
    (idx: number, xOffset: number, bucket: HistogramBucket) => {
      setTooltip({
        x: xOffset,
        text: `${fmtShort(bucket.start)} — ${bucket.count.toLocaleString()} events`,
      });
      if (isDragging.current && brushStartRef.current !== null) {
        brushEndRef.current = idx;
        const lo = Math.min(brushStartRef.current, idx);
        const hi = Math.max(brushStartRef.current, idx);
        setBrushRange({ lo, hi });
      }
    },
    [],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current || brushStartRef.current === null) return;
    isDragging.current = false;
    const startIdx = brushStartRef.current;
    const endIdx = brushEndRef.current ?? startIdx;
    brushStartRef.current = null;
    brushEndRef.current = null;
    setBrushRange(null);
    applyBrush(startIdx, endIdx);
  }, [applyBrush]);

  const handleContainerMouseLeave = useCallback(() => {
    setTooltip(null);
    if (isDragging.current) {
      // Cancelled drag — commit whatever was selected so far.
      const startIdx = brushStartRef.current;
      const endIdx = brushEndRef.current;
      isDragging.current = false;
      brushStartRef.current = null;
      brushEndRef.current = null;
      setBrushRange(null);
      if (startIdx !== null && endIdx !== null) {
        applyBrush(startIdx, endIdx);
      }
    }
  }, [applyBrush]);

  if (isLoading && !data) {
    return (
      <div className="flex h-16 items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]">
        <Spinner size={14} />
      </div>
    );
  }

  if (!data || buckets.length === 0) {
    return (
      <div className="flex h-10 items-center border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3">
        <span className="text-xs text-[var(--color-fg-muted)]">No events to display in histogram</span>
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleContainerMouseLeave}
    >
      {/* Bars */}
      <div className="flex h-16 items-end gap-px px-2 pt-2 pb-0">
        {buckets.map((bucket: HistogramBucket, idx: number) => {
          const heightPct = Math.max(4, (bucket.count / maxCount) * 100);
          const isInBrush =
            brushRange !== null && idx >= brushRange.lo && idx <= brushRange.hi;

          return (
            <div
              key={bucket.start}
              className="relative flex-1 cursor-crosshair"
              style={{ height: "100%", display: "flex", alignItems: "flex-end" }}
              onMouseDown={() => handleMouseDown(idx)}
              onMouseEnter={(e) => {
                const containerEl = e.currentTarget.closest<HTMLElement>(".relative");
                const containerLeft = containerEl?.getBoundingClientRect().left ?? 0;
                const rect = e.currentTarget.getBoundingClientRect();
                const xOffset = rect.left - containerLeft + rect.width / 2;
                handleMouseEnter(idx, xOffset, bucket);
              }}
            >
              <div
                className={cn(
                  "w-full rounded-t-[1px] transition-colors",
                  isInBrush
                    ? "bg-[var(--color-accent)]"
                    : "bg-[var(--color-accent)] opacity-30 hover:opacity-60",
                )}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between px-2 pb-1 text-[10px] text-[var(--color-fg-muted)]">
        <span>{data.min ? fmtShort(data.min) : ""}</span>
        <span>
          {buckets[Math.floor(buckets.length / 2)]
            ? fmtShort(buckets[Math.floor(buckets.length / 2)].start)
            : ""}
        </span>
        <span>{data.max ? fmtShort(data.max) : ""}</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-fg-primary)] whitespace-nowrap shadow"
          style={{ left: tooltip.x + 8 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
