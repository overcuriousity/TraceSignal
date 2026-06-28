import { Cpu } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  status: "ok" | "not_embedded";
  onEmbed: () => void;
}

export function EmbeddingStatusBanner({ status, onEmbed }: Props) {
  if (status === "ok") return null;

  return (
    <div className="flex items-center gap-3 rounded border border-[var(--color-warning)] border-opacity-30 bg-[var(--color-warning)] bg-opacity-10 px-3 py-2.5 text-xs">
      <Cpu size={14} className="text-[var(--color-warning)] shrink-0" />
      <p className="flex-1 text-[var(--color-fg-secondary)]">
        No embeddings found for this timeline. Generate embeddings to enable similarity
        search and anomaly detection.
      </p>
      <Button variant="outline" size="sm" onClick={onEmbed}>
        Run Embedding
      </Button>
    </div>
  );
}
