import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tag, MessageSquare, X } from "lucide-react";
import { annotationsApi } from "@/api/annotations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

interface Props {
  selectedIds: string[];
  caseId: string;
  timelineId: string;
  onClear: () => void;
}

export function BulkActionBar({ selectedIds, caseId, timelineId, onClear }: Props) {
  const [mode, setMode] = useState<"tag" | "comment" | null>(null);
  const [value, setValue] = useState("");
  const qc = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const type = mode === "tag" ? "tag" : "comment";
      await Promise.all(
        selectedIds.map((eventId) =>
          annotationsApi.create(caseId, timelineId, eventId, type, value.trim()),
        ),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["annotations", caseId, timelineId] });
      onClear();
      setMode(null);
      setValue("");
    },
    onError: () => {
      // Partial successes may have committed; refresh to reflect actual state.
      qc.invalidateQueries({ queryKey: ["annotations", caseId, timelineId] });
    },
  });

  if (selectedIds.length === 0) return null;

  return (
    <div className="flex items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2.5">
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
              if (e.key === "Enter" && value.trim()) mutate();
              if (e.key === "Escape") setMode(null);
            }}
            className="flex-1 max-w-xs"
          />
          <Button
            variant="accent"
            size="sm"
            disabled={!value.trim() || isPending}
            onClick={() => mutate()}
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
  );
}
