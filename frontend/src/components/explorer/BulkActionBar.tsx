import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tag, MessageSquare, ShieldCheck, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { annotationsApi } from "@/api/annotations";
import type { Event } from "@/api/types";

interface Props {
  selectedEvents: Event[];
  caseId: string;
  onClear: () => void;
}

export function BulkActionBar({ selectedEvents, caseId, onClear }: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"tag" | "comment" | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["annotations", caseId] });
    qc.invalidateQueries({ queryKey: ["anomalies", caseId] });
  };

  async function applyToAll() {
    if (!mode || !value.trim()) return;
    setError(null);
    setIsPending(true);
    const type = mode === "tag" ? "tag" : "comment";
    try {
      await Promise.all(
        selectedEvents.map((event) =>
          annotationsApi.create(
            caseId,
            event.source_id,
            event.event_id,
            type,
            value.trim(),
          ),
        ),
      );
      invalidate();
      onClear();
      setMode(null);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPending(false);
    }
  }

  async function markAllNormal() {
    setError(null);
    setIsPending(true);
    try {
      await Promise.all(
        selectedEvents.map((event) =>
          annotationsApi.create(
            caseId,
            event.source_id,
            event.event_id,
            "normal",
            "normal operation",
          ),
        ),
      );
      invalidate();
      onClear();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPending(false);
    }
  }

  if (selectedEvents.length === 0) return null;

  return (
    <div className="flex flex-col border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      {error && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-[var(--color-danger)] bg-[var(--color-danger-dim)]">
          <AlertCircle size={12} />
          {error}
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-xs font-medium text-[var(--color-fg-secondary)]">
        {selectedEvents.length} selected
      </span>

      {mode === null ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setMode("tag")}>
            <Tag size={13} /> Tag
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMode("comment")}>
            <MessageSquare size={13} /> Comment
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={markAllNormal}
          >
            {isPending ? <Spinner size={13} /> : <ShieldCheck size={13} />}
            Mark Normal
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={onClear}
          >
            <X size={14} />
          </Button>
        </>
      ) : (
        <>
          <span className="text-xs text-[var(--color-fg-muted)] capitalize">{mode}:</span>
          <Input
            autoFocus
            placeholder={mode === "tag" ? "tag label…" : "your comment…"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) applyToAll();
              if (e.key === "Escape") setMode(null);
            }}
            className="flex-1 max-w-xs"
          />
          <Button
            variant="accent"
            size="sm"
            disabled={!value.trim() || isPending}
            onClick={applyToAll}
          >
            {isPending ? <Spinner size={13} /> : "Apply"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
            Cancel
          </Button>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={onClear}>
            <X size={14} />
          </Button>
        </>
      )}
      </div>
    </div>
  );
}
