import { Info } from "lucide-react";
import { Tooltip } from "./Tooltip";

interface Props {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  size?: number;
}

/**
 * A small hoverable "?" affordance for inline term help — a muted `Info` icon
 * wrapped in the shared `Tooltip`. Definitions live in `lib/glossary.ts` so the
 * copy is shared with the first-run guidance panel. Keep it inline next to the
 * term it explains.
 */
export function InfoHint({ content, side = "top", size = 12 }: Props) {
  return (
    <Tooltip content={content} side={side}>
      <span
        className="inline-flex cursor-help align-middle text-[var(--color-fg-muted)] hover:text-[var(--color-fg-secondary)]"
        aria-label={content}
      >
        <Info size={size} />
      </span>
    </Tooltip>
  );
}
