import { Cpu } from "lucide-react";
import { EmbedWizard } from "@/components/timelines/EmbedWizard";
import type { Source } from "@/api/types";

interface Props {
  status: "ok" | "not_embedded";
  /** Pass a source so the wizard can trigger embedding. */
  source: Source | null;
}

export function EmbeddingStatusBanner({ status, source }: Props) {
  if (status === "ok" || !source) return null;

  return (
    <div className="flex items-center gap-3 rounded border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2.5 text-xs">
      <Cpu size={14} className="text-[var(--color-warning)] shrink-0" />
      <p className="flex-1 text-[var(--color-fg-secondary)]">
        No embeddings found for {source.name}. Generate embeddings to enable
        similarity search and anomaly detection.
      </p>
      <EmbedWizard caseId={source.case_id} source={source} />
    </div>
  );
}
