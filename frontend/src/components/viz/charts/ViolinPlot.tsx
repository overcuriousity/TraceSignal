import { format as formatNum } from "d3-format";
import { ChartEmptyState } from "@/components/viz/primitives/ChartEmptyState";
import { NumericPlotFrame } from "@/components/viz/primitives/NumericPlotFrame";
import { PointStrip, ViolinMark } from "@/components/viz/charts/distributionMarks";
import { svgLocalPoint } from "@/components/viz/lib/pointer";
import { kdeFromBins } from "@/components/viz/lib/stats";
import type { FieldNumericResponse } from "@/api/types";

const fmtValue = formatNum(",.3~f");
const MAX_HALF_WIDTH = 90;

interface ViolinPlotProps {
  stats: FieldNumericResponse;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  height?: number;
  color?: string;
  /** Overlay the response's sampled raw values as a jittered strip — the
   * lecture's fix for violins that imply data where there is none. */
  showPoints?: boolean;
}

/** Violin plot — the numeric field's distribution shape, from a smoothed
 * version of the server's fixed-width bin counts (see `kdeFromBins`). Shows
 * bimodality/skew a box plot's five-number summary would hide. */
export function ViolinPlot({
  stats,
  svgRef,
  height = 260,
  color = "var(--color-accent)",
  showPoints = false,
}: ViolinPlotProps) {
  const density = kdeFromBins(stats.bins);
  if (stats.count === 0 || density.length === 0 || stats.min == null || stats.max == null) {
    return (
      <ChartEmptyState hint="This field may not be numeric — try a Top-values (bar) chart instead.">
        No numeric values for this field in range.
      </ChartEmptyState>
    );
  }

  return (
    <NumericPlotFrame
      svgRef={svgRef}
      height={height}
      min={stats.min}
      max={stats.max}
      yTickFormat={(v) => fmtValue(v)}
    >
      {({ innerHeight, margin, y, cx, setHover }) => (
        <>
          <ViolinMark dist={stats} cx={cx} halfWidth={MAX_HALF_WIDTH} y={y} color={color} />
          {showPoints && stats.points && (
            <PointStrip values={stats.points.values} cx={cx} spread={MAX_HALF_WIDTH / 2} y={y} />
          )}
          {/* Invisible hover strip along the value axis for a value-at-cursor tooltip. */}
          <rect
            x={cx - MAX_HALF_WIDTH}
            y={0}
            width={MAX_HALF_WIDTH * 2}
            height={innerHeight}
            fill="transparent"
            onMouseMove={(e) => {
              const local = svgLocalPoint(e, margin);
              if (!local) return;
              const localY = local.y;
              const value = y.invert(localY);
              setHover({ x: cx + margin.left, y: localY + margin.top, label: fmtValue(value) });
            }}
            onMouseLeave={() => setHover(null)}
          />
        </>
      )}
    </NumericPlotFrame>
  );
}
