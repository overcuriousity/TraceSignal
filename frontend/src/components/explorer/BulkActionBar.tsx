import { useState } from "react";
import { Tag, MessageSquare, ShieldCheck, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useAnnotationMutations } from "@/hooks/useAnnotationMutations";

interface Props {
  selectedIds: string[];
  caseId: string;
  timelineId: string;
  onClear: () => void;
}

export function BulkActionBar({ selectedIds, caseId, timelineId, onClear }: Props) {
  const [mode, setMode] = useState<"tag" | "comment" | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { add } = useAnnotationMutations(caseId, timelineId);

  function applyToAll() {
    if (!mode || !value.trim()) return;
    setError(null);
    const type = mode === "tag" ? "tag" : "comment";
    Promise.all(
      selectedIds.map((eventId) =>
        add.mutateAsync({ eventId, type, content: value.trim() }),
      ),
    ).then(() => {
      onClear();
      setMode(null);
      setValue("");
    }).catch((err: Error) => {
      setError(err.message);
    });
  }

  function markAllNormal() {
    setError(null);
    Promise.all(
      selectedIds.map((eventId) =>
        add.mutateAsync({ eventId, type: "normal", content: "normal operation" }),
      ),
    ).then(() => {
      onClear();
    }).catch((err: Error) => {
      setError(err.message);
    });
  }

  if (selectedIds.length === 0) return null;

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
        {selectedIds.length} selected
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
            disabled={add.isPending}
            onClick={markAllNormal}
          >
            {add.isPending ? <Spinner size={13} /> : <ShieldCheck size={13} />}
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
            disabled={!value.trim() || add.isPending}
            onClick={applyToAll}
          >
            {add.isPending ? <Spinner size={13} /> : "Apply"}
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
