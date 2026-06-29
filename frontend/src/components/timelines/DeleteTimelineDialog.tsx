import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { timelinesApi } from "@/api/timelines";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { Timeline } from "@/api/types";

interface Props {
  caseId: string;
  timeline: Timeline;
}

export function DeleteTimelineDialog({ caseId, timeline }: Props) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => timelinesApi.delete(caseId, timeline.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timelines", caseId] });
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 transition-base text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Trash2 size={14} />
      </Button>
      <DialogContent
        title={`Delete timeline "${timeline.name}"?`}
        description="Cascade-deletes all events, vectors, and annotations for this timeline."
      >
        <div className="space-y-4">
          <p className="rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-3 py-2 text-xs text-[var(--color-danger)]">
            {timeline.event_count.toLocaleString()} events and{" "}
            {timeline.vector_count.toLocaleString()} vectors will be permanently deleted.
          </p>
          {error && (
            <p className="text-xs text-[var(--color-danger)]">{(error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={() => mutate()}
            >
              {isPending ? "Deleting…" : "Delete Timeline"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
