import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { timelinesApi } from "@/api/timelines";
import { sourcesApi } from "@/api/sources";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

interface Props {
  caseId: string;
}

export function CreateTimelineDialog({ caseId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const { data: sources, isLoading: isLoadingSources } = useQuery({
    queryKey: ["sources", caseId],
    queryFn: () => sourcesApi.list(caseId),
    enabled: open,
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: () =>
      timelinesApi.create(
        caseId,
        name.trim(),
        desc.trim() || undefined,
        Array.from(selectedSourceIds),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timelines", caseId] });
      setOpen(false);
      setName("");
      setDesc("");
      setSelectedSourceIds(new Set());
    },
  });

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm">
          <Plus size={14} /> New Timeline
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New Timeline"
        description="A timeline is a named grouping of one or more sources."
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">
              Name <span className="text-[var(--color-danger)]">*</span>
            </label>
            <Input
              placeholder="e.g. Lateral movement timeline"
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
              placeholder="Notes about this grouping…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={4096}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">
              Sources
            </label>
            {isLoadingSources && <Spinner size={16} />}
            {sources && sources.length === 0 && (
              <p className="text-xs text-[var(--color-fg-muted)]">
                No sources available. Upload a source first.
              </p>
            )}
            {sources && sources.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-[var(--color-border)] p-2">
                {sources.map((source) => (
                  <label
                    key={source.id}
                    className="flex items-center gap-2 text-xs text-[var(--color-fg-secondary)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSourceIds.has(source.id)}
                      onChange={() => toggleSource(source.id)}
                      className="rounded border-[var(--color-border-strong)] accent-[var(--color-accent)]"
                    />
                    <span className="truncate">{source.name}</span>
                  </label>
                ))}
              </div>
            )}
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
