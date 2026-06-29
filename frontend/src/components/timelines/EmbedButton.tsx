import { useMutation } from "@tanstack/react-query";
import { Cpu } from "lucide-react";
import { sourcesApi } from "@/api/sources";
import { useJobsStore } from "@/stores/jobs";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Source } from "@/api/types";

interface Props {
  caseId: string;
  source: Source;
}

export function EmbedButton({ caseId, source }: Props) {
  const addJob = useJobsStore((s) => s.addJob);

  const { mutate, isPending } = useMutation({
    mutationFn: () => sourcesApi.embed(caseId, source.id),
    onSuccess: (result) => {
      addJob(result.job_id, `Embedding "${source.name}"`);
    },
  });

  const label = source.vector_count > 0 ? "Re-embed" : "Embed";
  const tip =
    source.vector_count > 0
      ? `${source.vector_count.toLocaleString()} vectors — click to re-run embedding`
      : "Generate vector embeddings for similarity search & anomaly detection";

  return (
    <Tooltip content={tip}>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => mutate()}
      >
        <Cpu size={13} />
        {isPending ? "Starting…" : label}
      </Button>
    </Tooltip>
  );
}
