import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { casesApi } from "@/api/cases";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Plus } from "lucide-react";

export function CreateCaseDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const qc = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => casesApi.create(name.trim(), desc.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cases"] });
      setOpen(false);
      setName("");
      setDesc("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm">
          <Plus size={14} /> New Case
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New Investigation Case"
        description="A case groups related timelines under a single investigation."
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">
              Case name <span className="text-[var(--color-danger)]">*</span>
            </label>
            <Input
              placeholder="e.g. Compromised endpoint ACME-042"
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
            <textarea
              placeholder="Short description of the investigation…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={4096}
              rows={3}
              className="w-full resize-none rounded border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-muted)] focus:border-[var(--color-accent)] focus:outline-none"
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
              {isPending ? "Creating…" : "Create Case"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
