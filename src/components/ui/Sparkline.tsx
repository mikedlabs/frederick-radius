import type { CSSProperties } from "react";
import { sparklinePath } from "@/lib/ui/sparkline";

/**
 * Sparkline — a tiny inline trend line, used sparingly and only where a
 * trend actually means something (a river rising, the day's temperature
 * arc). Hairline by default so it reads as editorial data, not a chart.
 *
 * A plain (server-renderable) component: no client JS, no animation. The
 * geometry lives in the pure `sparklinePath` helper; this only wraps it in
 * an SVG. Renders nothing for a series shorter than two points, because one
 * reading is not a trend.
 *
 * The SVG stretches to its CSS box (preserveAspectRatio="none") while the
 * stroke stays uniform (vector-effect non-scaling-stroke), so the same
 * viewBox works at any width. Give it an aria-label describing the trend.
 */
export default function Sparkline({
  values,
  width = 100,
  height = 24,
  stroke = "var(--app-ink-3)",
  fill,
  strokeWidth = 1.5,
  showDot = true,
  className,
  style,
  ariaLabel,
}: {
  values: number[];
  /** viewBox dimensions; render size is controlled by className / style. */
  width?: number;
  height?: number;
  stroke?: string;
  /** Optional area fill under the line (e.g. a faint tint of the stroke). */
  fill?: string;
  strokeWidth?: number;
  showDot?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const g = sparklinePath(values, width, height);
  if (!g) return null;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ overflow: "visible", ...style }}
      role="img"
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {fill && <path d={g.area} fill={fill} stroke="none" />}
      <path
        d={g.line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showDot && (
        <circle cx={g.last.x} cy={g.last.y} r={strokeWidth * 1.6} fill={stroke} />
      )}
    </svg>
  );
}
