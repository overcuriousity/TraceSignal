/**
 * EventGrid — virtualized forensic event table.
 *
 * Uses TanStack Table for column management and TanStack Virtual for row
 * virtualization (handles 100k+ rows smoothly with offset pagination).
 */
import { useMemo, useRef, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, AlertTriangle, Tag, MessageSquare } from "lucide-react";
import type { Event, Annotation } from "@/api/types";
import { fmtTimestamp } from "@/lib/time";
import { truncate } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const ROW_HEIGHT = 36; // px — compact forensic grid
const OVERSCAN = 10;

interface Props {
  events: Event[];
  total: number;
  offset: number;
  annotations: Map<string, Annotation[]>; // eventId → annotations
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  expandedId: string | null;
  onExpand: (event: Event | null) => void;
  onLoadMore: () => void;
  visibleColumns: string[];
}

/** Derive annotation chips for a row. */
function AnnotationChips({ anns }: { anns: Annotation[] }) {
  if (!anns || anns.length === 0) return null;
  const tags = anns.filter((a) => a.annotation_type === "tag" && a.origin === "user");
  const comments = anns.filter(
    (a) => a.annotation_type === "comment" && a.origin === "user",
  );
  const outliers = anns.filter((a) => a.annotation_type === "outlier");

  return (
    <span className="flex items-center gap-1">
      {outliers.length > 0 && (
        <Badge variant="outlier">
          <AlertTriangle size={9} className="mr-0.5" /> outlier
        </Badge>
      )}
      {tags.map((t, i) => (
        <Badge key={i} variant="accent">
          <Tag size={9} className="mr-0.5" />
          {t.content}
        </Badge>
      ))}
      {comments.length > 0 && (
        <Badge variant="muted">
          <MessageSquare size={9} className="mr-0.5" />
          {comments.length}
        </Badge>
      )}
    </span>
  );
}

export function EventGrid({
  events,
  total,
  offset,
  annotations,
  selectedIds,
  onToggleSelect,
  expandedId,
  onExpand,
  onLoadMore,
  visibleColumns,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Build columns based on visibleColumns preference
  const columns = useMemo<ColumnDef<Event>[]>(() => {
    const cols: ColumnDef<Event>[] = [
      // Checkbox
      {
        id: "_select",
        size: 36,
        header: () => null,
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.original.event_id)}
            onChange={() => onToggleSelect(row.original.event_id)}
            className="h-3.5 w-3.5 cursor-pointer rounded border-[var(--color-border-strong)] accent-[var(--color-accent)]"
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
    ];

    const colDefs: Record<string, ColumnDef<Event>> = {
      timestamp: {
        id: "timestamp",
        header: "Timestamp",
        size: 170,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[var(--color-fg-secondary)]">
            {fmtTimestamp(row.original.timestamp)}
          </span>
        ),
      },
      source: {
        id: "source",
        header: "Source",
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-xs truncate text-[var(--color-info)]">
            {row.original.source ?? "—"}
          </span>
        ),
      },
      display_name: {
        id: "display_name",
        header: "Display Name",
        size: 160,
        cell: ({ row }) => (
          <span className="text-xs truncate text-[var(--color-fg-secondary)]">
            {row.original.display_name ?? "—"}
          </span>
        ),
      },
      message: {
        id: "message",
        header: "Message",
        size: 999, // flex
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-fg-primary)]">
            {truncate(row.original.message, 200)}
          </span>
        ),
      },
      tags: {
        id: "tags",
        header: "Tags",
        size: 120,
        cell: ({ row }) =>
          row.original.tags.length > 0 ? (
            <span className="flex flex-wrap gap-0.5">
              {row.original.tags.slice(0, 3).map((t, i) => (
                <Badge key={i} variant="muted">
                  {t}
                </Badge>
              ))}
            </span>
          ) : null,
      },
      _annotations: {
        id: "_annotations",
        header: "Annotations",
        size: 160,
        cell: ({ row }) => (
          <AnnotationChips
            anns={annotations.get(row.original.event_id) ?? []}
          />
        ),
      },
    };

    for (const colId of visibleColumns) {
      const def = colDefs[colId];
      if (def) {
        cols.push(def);
      } else {
        // Dynamic attribute column — key not in the known set
        cols.push({
          id: colId,
          header: colId,
          size: 160,
          cell: ({ row }) => (
            <span className="font-mono text-xs truncate text-[var(--color-fg-secondary)]">
              {row.original.attributes[colId] ?? "—"}
            </span>
          ),
        });
      }
    }

    // Expand toggle
    cols.push({
      id: "_expand",
      size: 32,
      header: () => null,
      cell: ({ row }) => (
        <ChevronRight
          size={13}
          className={cn(
            "text-[var(--color-fg-muted)] transition-transform duration-150",
            expandedId === row.original.event_id && "rotate-90",
          )}
        />
      ),
    });

    return cols;
  }, [visibleColumns, selectedIds, annotations, expandedId, onToggleSelect]);

  const table = useReactTable({
    data: events,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  // Load more when near bottom
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom && events.length < total) {
      onLoadMore();
    }
  }, [events.length, total, onLoadMore]);

  return (
    <div className="flex flex-1 min-w-0 flex-col h-full">
      {/* Header row */}
      <div className="flex shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]">
        {table.getHeaderGroups().map((hg) =>
          hg.headers.map((h) => (
            <div
              key={h.id}
              className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)] select-none"
              style={{
                width: h.column.id === "message" ? undefined : h.getSize(),
                flex: h.column.id === "message" ? "1 1 0" : undefined,
              }}
            >
              {flexRender(h.column.columnDef.header, h.getContext())}
            </div>
          )),
        )}
      </div>

      {/* Virtualized body */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          {virtualItems.map((vItem) => {
            const row = rows[vItem.index];
            const event = row.original;
            const isExpanded = expandedId === event.event_id;
            const isSelected = selectedIds.has(event.event_id);
            const hasOutlier = (annotations.get(event.event_id) ?? []).some(
              (a) => a.annotation_type === "outlier",
            );

            return (
              <div
                key={vItem.key}
                style={{
                  position: "absolute",
                  top: vItem.start,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                }}
                onClick={() =>
                  onExpand(isExpanded ? null : event)
                }
                className={cn(
                  "flex items-center border-b border-[var(--color-border-subtle)] cursor-pointer transition-base group",
                  isExpanded
                    ? "bg-[var(--color-bg-active)] border-[var(--color-accent)] border-opacity-40"
                    : isSelected
                      ? "bg-[var(--color-accent-dim)]"
                      : "hover:bg-[var(--color-bg-hover)]",
                  hasOutlier && !isSelected && !isExpanded && "border-l-2 border-l-[var(--color-outlier)] border-l-opacity-50",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    className="px-2.5 truncate"
                    style={{
                      width:
                        cell.column.id === "message"
                          ? undefined
                          : cell.column.getSize(),
                      flex: cell.column.id === "message" ? "1 1 0" : undefined,
                      minWidth: 0,
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-1.5 text-xs text-[var(--color-fg-muted)]">
        <span>
          Showing {events.length.toLocaleString()} of {total.toLocaleString()} events
          {offset > 0 ? ` (offset ${offset.toLocaleString()})` : ""}
        </span>
        {events.length < total && (
          <button
            className="text-[var(--color-accent)] hover:underline transition-base"
            onClick={onLoadMore}
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
