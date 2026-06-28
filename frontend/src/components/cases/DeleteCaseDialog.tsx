import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { casesApi } from "@/api/cases";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Trash2 } from "lucide-react";
import type { Case } from "@/api/types";

interface Props {
  case_: Case;
  onClose?: () => void;
}

export function DeleteCaseDialog({ case_, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => casesApi.delete(case_.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cases"] });
      setOpen(false);
      onClose?.();
      navigate("/");
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
        title={`Delete "${case_.name}"?`}
        description="This will cascade-delete all timelines, events, vectors, and annotations. This cannot be undone."
      >
        <div className="space-y-4">
          <p className="rounded border border-[var(--color-danger)] border-opacity-30 bg-[var(--color-danger-dim)] px-3 py-2 text-xs text-[var(--color-danger)]">
            All data for this case will be permanently deleted from ClickHouse, Qdrant, and
            PostgreSQL.
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
              {isPending ? "Deleting…" : "Delete Case"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
