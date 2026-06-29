import { useMutation } from "@tanstack/react-query";
import { Cpu } from "lucide-react";
import { timelinesApi } from "@/api/timelines";
import { useJobsStore } from "@/stores/jobs";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";

interface Props {
  caseId: string;
  timelineId: string;
  timelineName: string;
  vectorCount: number;
}

export function EmbedButton({ caseId, timelineId, timelineName, vectorCount }: Props) {
  const addJob = useJobsStore((s) => s.addJob);

  const { mutate, isPending } = useMutation({
    mutationFn: () => timelinesApi.embed(caseId, timelineId),
    onSuccess: (result) => {
      addJob(result.job_id, `Embedding "${timelineName}"`);
    },
  });

  const label = vectorCount > 0 ? "Re-embed" : "Embed";
  const tip =
    vectorCount > 0
      ? `${vectorCount.toLocaleString()} vectors — click to re-run embedding`
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
