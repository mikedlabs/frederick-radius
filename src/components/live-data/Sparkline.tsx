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

export default function Sparkline({
  values,
  width = 120,
  height = 32,
  stroke = "currentColor",
  strokeWidth = 1.5,
  fillOpacity = 0.12,
  showLast = true,
  animated = false,
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

  // Normalize Y so the trend uses the full vertical space. Pad 8% top
  // and bottom so the line doesn't kiss the edges.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
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
