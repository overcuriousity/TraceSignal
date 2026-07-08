/**
 * FrameBar — the single global scope every detector runs under (replacing the
 * old per-view self/temporal toggle). "Scan all events" = self-baseline over
 * the whole corpus; "Compare baseline" = score the active definition's suspect
 * windows against its baseline window. The choice + active definition live in
 * useBaselineStore; a one-line status states exactly what is active.
 */
import { useQuery } from "@tanstack/react-query";
import { Layers, ScanLine } from "lucide-react";
import { baselinesApi } from "@/api/baselines";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useBaselineStore } from "@/stores/baseline";
import { cn } from "@/lib/cn";

interface Props {
  caseId: string;
  timelineId: string;
  /** Opens the Windows & normality section so the analyst can build one. */
  onBuildBaseline: () => void;
}

export function FrameBar({ caseId, timelineId, onBuildBaseline }: Props) {
  const { frame, setFrame, activeBaselineId, setActiveBaselineId } = useBaselineStore();

  const { data } = useQuery({
    queryKey: ["baselines", caseId, timelineId],
    queryFn: () => baselinesApi.list(caseId, timelineId),
  });
  const definitions = data?.baselines ?? [];
  const active = definitions.find((d) => d.id === activeBaselineId) ?? null;

  const status =
    frame === "self"
      ? "Every detector scans all events."
      : active
        ? `Comparing ${active.suspect_windows.length} suspect window${active.suspect_windows.length === 1 ? "" : "s"} against “${active.name}”.`
        : "Select or build a baseline to compare against.";

  return (
    <div className="mb-3 space-y-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-base)] p-2">
      <div className="flex items-center gap-1">
        {(
          [
            ["self", ScanLine, "Scan all events"],
            ["baseline", Layers, "Compare baseline"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setFrame(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              frame === id
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg-secondary)]",
            )}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {frame === "baseline" && (
        <div className="flex items-center gap-1.5">
          <Select
            value={activeBaselineId ?? ""}
            onValueChange={(v) => setActiveBaselineId(v || null)}
          >
            <SelectTrigger className="h-7 flex-1 px-2 text-xs" aria-label="Baseline definition">
              <SelectValue placeholder={definitions.length ? "Pick a baseline…" : "No baselines yet"} />
            </SelectTrigger>
            <SelectContent>
              {definitions.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">
                  {d.name} · {d.suspect_windows.length}w
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={onBuildBaseline}
            className="shrink-0 rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-fg-secondary)] hover:border-[var(--color-border-focus)]"
          >
            + New
          </button>
        </div>
      )}

      <p className="text-[11px] text-[var(--color-fg-muted)]">{status}</p>
    </div>
  );
}
