/**
 * BaselineBuilderDrawer — overlay drawer hosting the (dense, 30-input-capable)
 * BaselineSection window-editor form, moved out of the Anomalies tab's inline
 * flow so the default view stays scannable. Opened from FrameBar's "Manage
 * baselines" button and automatically when histogram mark-mode arms (the
 * brushed range must land in the editor). State lives in useUiStore so the
 * Explorer's histogram brush can open it from outside the panel.
 */
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useUiStore } from "@/stores/ui";
import { BaselineSection } from "./WindowsNormality";

interface Props {
  caseId: string;
  timelineId: string;
}

export function BaselineBuilderDrawer({ caseId, timelineId }: Props) {
  const open = useUiStore((s) => s.baselineBuilderOpen);
  const setOpen = useUiStore((s) => s.setBaselineBuilderOpen);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      {/* Drawer */}
      <div className="absolute right-0 top-0 flex h-full w-[min(560px,100vw)] flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-xl">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="flex-1 text-sm font-semibold text-[var(--color-fg-primary)]">
            Baselines &amp; suspect windows
          </h3>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X size={14} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <BaselineSection caseId={caseId} timelineId={timelineId} />
        </div>
      </div>
    </div>
  );
}
