/**
 * Sparkline — tiny inline line chart for time-series readings.
 *
 * Pure SVG, zero deps, server-renderable. Renders a path through the
 * given values, normalized into a viewBox so the same component
 * works at any size. The current value (last point) gets a dot so
 * the present moment is visually anchored.
 *
 * Designed as the visual primitive for the /rivers dashboard and any
 * other live-data surface that wants a 24h trend at a glance — a
 * single LineDashboard pattern can drop this in next to a headline
 * number without thinking about chart libraries.
 */

/**
 * The vertical domain a sparkline draws against.
 *
 * Stretching min to max over the full height has no floor: a gauge that
 * moved 0.01 ft between readings, which readingTrend() correctly calls
 * Steady, drew as a full-height square wave. The domain is therefore never
 * narrower than `minRange`, centered on the readings, so small wobble stays
 * small. The default is five times readingTrend's steady tolerance (1% of
 * the level, or 0.05 for tiny readings), which keeps anything it calls
 * steady within about a fifth of the height.
 */
export function sparklineDomain(
  values: readonly number[],
  minRange?: number,
): { min: number; max: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const mid = (lo + hi) / 2;
  const floor = minRange ?? Math.max(Math.abs(mid) * 0.05, 0.25);
  const span = Math.max(hi - lo, floor);
  if (span <= 0) return { min: mid - 0.5, max: mid + 0.5 };
  return { min: mid - span / 2, max: mid + span / 2 };
}

export default function Sparkline({
  values,
  width = 120,
  height = 32,
  stroke = "currentColor",
  strokeWidth = 1.5,
  fillOpacity = 0.12,
  showLast = true,
  animated = false,
  minRange,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  /** Opacity of the area-fill under the line. 0 disables the fill. */
  fillOpacity?: number;
  /** Highlight the latest point with a dot. */
  showLast?: boolean;
  /** One-shot reveal on mount: the line draws left-to-right and the latest
   *  point pulses as a "live" beacon. Freezes under prefers-reduced-motion. */
  animated?: boolean;
  /** The smallest value range drawn over the full height, in the readings'
   *  own units. Defaults to a floor scaled to the level (see sparklineDomain). */
  minRange?: number;
}) {
  if (!values || values.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={stroke}
          strokeOpacity="0.3"
          strokeWidth="1"
        />
      </svg>
    );
  }

  // Normalize Y against a floored domain so a real trend uses the vertical
  // space and a steady one stays flat. Pad 8% top and bottom so the line
  // doesn't kiss the edges.
  const { min, max } = sparklineDomain(values, minRange);
  const span = max - min;
  const padY = height * 0.08;
  const innerH = height - padY * 2;

  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = padY + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  // Area fill: line path + close to the bottom-right and bottom-left
  // so the stroke sits on top of a subtle filled region.
  const areaPath =
    `${linePath} L ${width} ${height} L 0 ${height} Z`;

  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {fillOpacity > 0 && (
        <path d={areaPath} fill={stroke} opacity={fillOpacity} />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        // pathLength normalizes the dash math to 1 so the draw-in keyframe
        // works regardless of the path's real length.
        pathLength={animated ? 1 : undefined}
        className={animated ? "spark-line" : undefined}
      />
      {showLast && (
        <circle
          cx={lastX}
          cy={lastY}
          r={strokeWidth + 1}
          fill={stroke}
          className={animated ? "spark-beacon" : undefined}
        />
      )}
    </svg>
  );
}
