import { SearchX } from "lucide-react";

interface ChartEmptyStateProps {
  /** "sm" matches compact charts (bar/pie), "md" the taller numeric/time charts. */
  size?: "sm" | "md";
  /** Primary line — what happened. */
  children: React.ReactNode;
  /** Optional second line — the likely cause and what to try next. */
  hint?: React.ReactNode;
}

/**
 * Placeholder shown instead of a chart when its guard decides there is nothing
 * to plot. The primary line and the diagnostic `hint` stay per-chart (each
 * chart knows why it's empty — e.g. time charts exclude undated events); only
 * the markup is shared. Both height class strings are literal so Tailwind's
 * scanner sees them.
 */
export function ChartEmptyState({ size = "md", children, hint }: ChartEmptyStateProps) {
  return (
    <div
      className={
        size === "sm"
          ? "flex h-[160px] flex-col items-center justify-center gap-1.5 px-6 text-center"
          : "flex h-[220px] flex-col items-center justify-center gap-1.5 px-6 text-center"
      }
    >
      <SearchX size={20} className="text-[var(--color-fg-muted)] opacity-70" />
      <div className="text-sm text-[var(--color-fg-secondary)]">{children}</div>
      {hint && <div className="max-w-xs text-xs text-[var(--color-fg-muted)]">{hint}</div>}
    </div>
  );
}
