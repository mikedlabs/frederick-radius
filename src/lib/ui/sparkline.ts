/**
 * sparkline — pure SVG path geometry for a tiny inline trend line.
 *
 * Framework-free so the geometry is testable and the <Sparkline> component
 * can stay a thin, server-renderable wrapper. Returns the line path, a
 * closed area path (for an optional fill), and the last point (for an
 * emphasized endpoint dot). Coordinates are in the caller's viewBox space;
 * render the SVG with preserveAspectRatio="none" + a non-scaling stroke to
 * stretch it to any width while keeping the stroke crisp.
 *
 * Returns null for fewer than two points — a single reading is not a trend,
 * and the caller should render nothing rather than a misleading flat line.
 */
export type SparkGeometry = {
  line: string;
  area: string;
  last: { x: number; y: number };
};

export function sparklinePath(
  values: number[],
  width = 100,
  height = 24,
  pad = 2,
): SparkGeometry | null {
  if (!Array.isArray(values) || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1; // flat series → a centered line, never /0
  const n = values.length;
  const pts = values.map((v, i) => ({
    x: (i / (n - 1)) * width,
    y: height - pad - ((v - min) / range) * (height - pad * 2),
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width.toFixed(2)} ${height} L0 ${height} Z`;
  return { line, area, last: pts[n - 1] };
}
