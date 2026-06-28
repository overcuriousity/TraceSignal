/**
 * CoverageRing — SVG donut showing triage coverage for a timeline.
 * Coverage = events with ≥1 user annotation / total events.
 * This is woven-in gamification: real data, no fabricated "score".
 */

interface Props {
  annotated: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function CoverageRing({
  annotated,
  total,
  size = 40,
  strokeWidth = 4,
  className,
}: Props) {
  const ratio = total > 0 ? Math.min(annotated / total, 1) : 0;
  const pct = Math.round(ratio * 100);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * ratio;

  const color =
    pct >= 100
      ? "var(--color-success)"
      : pct >= 75
        ? "var(--color-accent)"
        : pct >= 25
          ? "var(--color-info)"
          : "var(--color-fg-muted)";

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
      title={`Triage coverage: ${annotated.toLocaleString()} / ${total.toLocaleString()} events annotated (${pct}%)`}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-bg-active)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>
      <span
        className="absolute text-[10px] font-mono font-semibold"
        style={{ color }}
      >
        {pct}%
      </span>
    </div>
  );
}
