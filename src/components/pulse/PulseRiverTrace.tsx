import type { Reading } from "@/lib/integrations/usgsWater";
import { gaugeLabel, gaugePlot } from "@/lib/rivers/gaugeHistory";
import styles from "./PulseBoard.module.css";

const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const feet = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** The same six-hour window and missing-interval rule as the full USGS chart. */
export default function PulseRiverTrace({ name, readings, end }: { name: string; readings: Reading[]; end: string }) {
  const plot = gaugePlot(readings, "PT6H", end);
  if (!plot || plot.rows.length < 2) return null;
  // A hundredth of a foot can be measurement noise. Keep a visible foot of
  // vertical context and label the axis even when the water is nearly level.
  const bottom = Math.floor(plot.low * 2) / 2;
  const top = Math.max(bottom + 1, Math.ceil(plot.high * 2) / 2);
  const plotSpan = plot.top - plot.bottom;
  const yStart = (plot.top - top) / plotSpan * 100;
  const ySize = (top - bottom) / plotSpan * 100;
  const range = plot.low === plot.high ? feet.format(plot.low) : `${feet.format(plot.low)}–${feet.format(plot.high)}`;
  return (
    <span className={styles.riverTrace}>
      <span className={styles.traceTitle}>{gaugeLabel(name)} · 6 hours</span>
      <span className={styles.traceRange}>{range} ft observed{plot.segments.length > 1 && " · gaps in record"}</span>
      <span className={styles.tracePlot}>
        <span aria-hidden className={styles.traceFeet}><span>{feet.format(top)} ft</span><span>{feet.format(bottom)} ft</span></span>
        <svg aria-hidden viewBox={`0 ${yStart} 1000 ${ySize}`} preserveAspectRatio="none">
          {plot.segments.map((segment) => (
            <polyline
              key={segment[0].x}
              points={segment.length === 1
                ? `${segment[0].x},${segment[0].y} ${segment[0].x + 0.01},${segment[0].y}`
                : segment.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
            />
          ))}
        </svg>
      </span>
      <span className={styles.traceAxis}><span>{clock.format(plot.start)}</span><span>{clock.format(plot.finish)} ET</span></span>
    </span>
  );
}
