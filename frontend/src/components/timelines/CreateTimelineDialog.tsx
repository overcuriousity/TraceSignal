import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { timelinesApi } from "@/api/timelines";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Props {
  caseId: string;
}

export function CreateTimelineDialog({ caseId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const qc = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: () =>
      timelinesApi.create(caseId, name.trim(), desc.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timelines", caseId] });
      setOpen(false);
      setName("");
      setDesc("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm">
          <Plus size={14} /> New Timeline
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New Timeline"
        description="A timeline holds a single ingested data source (one log file or batch)."
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">
              Name <span className="text-[var(--color-danger)]">*</span>
            </label>
            <Input
              placeholder="e.g. Windows Security Event Log 2024-Q1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={255}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">
              Description
            </label>
            <Input
              placeholder="Source file, date range, or notes…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={4096}
            />
          </div>
          {error && (
            <p className="text-xs text-[var(--color-danger)]">{(error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              variant="accent"
              size="sm"
              disabled={!name.trim() || isPending}
              onClick={() => mutate()}
            >
              {isPending ? "Creating…" : "Create Timeline"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
