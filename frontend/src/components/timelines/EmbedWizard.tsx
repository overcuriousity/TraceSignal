/**
 * Simplified embedding trigger for a source.
 *
 * The previous per-source/artifact field-selection wizard is temporarily
 * reduced to a confirmation button while the Case/Source/Timeline model
 * refactor settles. Future iterations can restore granular field selection
 * via the /embedding-fields endpoint and per-artifact config.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Cpu, Check } from "lucide-react";
import { sourcesApi } from "@/api/sources";
import { useJobsStore } from "@/stores/jobs";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { Source } from "@/api/types";

interface Props {
  caseId: string;
  source: Source;
  /** Called after the embed job is started so parent can update. */
  onJobStarted?: (jobId: string) => void;
}

export function EmbedWizard({ caseId, source, onJobStarted }: Props) {
  const [open, setOpen] = useState(false);
  const addJob = useJobsStore((s) => s.addJob);
  const label = (source.vector_count ?? 0) > 0 ? "Re-embed" : "Embed";

  const embedMutation = useMutation({
    mutationFn: () => sourcesApi.embed(caseId, source.id),
    onSuccess: (result) => {
      addJob(result.job_id, `Embedding "${source.name}"`);
      onJobStarted?.(result.job_id);
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Cpu size={13} /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent title="Generate embeddings" className="max-w-md">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-[var(--color-fg-primary)]">
            Generate embeddings
          </h3>
          <p className="text-xs text-[var(--color-fg-secondary)]">
            This will embed {source.event_count.toLocaleString()} events from source{" "}
            <span className="font-mono">{source.name}</span> using the default model.
          </p>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="accent"
              size="sm"
              disabled={embedMutation.isPending}
              onClick={() => embedMutation.mutate()}
            >
              {embedMutation.isPending ? (
                <Spinner size={13} />
              ) : (
                <Check size={13} />
              )}
              {label}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
