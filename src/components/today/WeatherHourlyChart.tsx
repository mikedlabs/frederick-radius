import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
} from "lucide-react";
import { iconForShortForecast, type NwsHourly } from "@/lib/integrations/nws";

const ICONS = {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
} as const;

/**
 * WeatherHourlyChart — the visual replacement for the old 6-icon row.
 *
 * Renders an animated SVG temperature curve across all 12 NWS-provided
 * hourly periods. Beneath the curve: hour labels, per-hour weather
 * glyphs, and precipitation bars whose height scales with %-chance.
 * The curve draws-on from left to right on mount; the bars grow up
 * from the baseline staggered; the current-hour dot pulses to anchor
 * "you are here".
 *
 * All animation is CSS keyframes in globals.css (.wx-* selectors) so
 * the component stays server-rendered and ships zero client JS.
 */

type Props = {
  /** NWS hourly periods, starting at "now". 12 entries expected;
   *  fewer is fine — the chart scales to the count. */
  hours: NwsHourly[];
};

function hourLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  })
    .format(new Date(iso))
    .toLowerCase()
    .replace(" ", "");
}

export default function WeatherHourlyChart({ hours }: Props) {
  if (hours.length === 0) return null;

  // SVG geometry. The viewBox is 12 columns × 100 units tall; we
  // letterbox the temperature line into the top 60u so there's
  // breathing room below for the per-hour glyph row.
  const W = 360;
  const H = 80;
  const PAD_X = 14;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 26; // reserved for the precip-bar band
  const n = hours.length;
  const step = (W - 2 * PAD_X) / Math.max(1, n - 1);

  // Domain: clamp to actual min/max with a 1° padding so the curve
  // never hugs the top or bottom edge of the chart.
  const temps = hours.map((h) => h.temperature);
  let tMin = Math.min(...temps);
  let tMax = Math.max(...temps);
  if (tMin === tMax) {
    tMin -= 1;
    tMax += 1;
  }
  tMin = Math.floor(tMin - 1);
  tMax = Math.ceil(tMax + 1);

  const yFor = (t: number) => {
    const usable = H - PAD_TOP - PAD_BOTTOM;
    const ratio = (t - tMin) / (tMax - tMin);
    return PAD_TOP + (1 - ratio) * usable;
  };
  const xFor = (i: number) => PAD_X + i * step;

  // Polyline path through the points + a closed fill area below it.
  const linePath = temps
    .map((t, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(t).toFixed(1)}`)
    .join(" ");
  const fillPath =
    linePath +
    ` L ${xFor(n - 1).toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)}` +
    ` L ${xFor(0).toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} Z`;

  // Index of the current hour — first entry from the NWS API IS the
  // current hour, so the marker sits on i=0. Drawn on top of the
  // curve as a pulsing dot + radiating ring.
  const nowIdx = 0;

  return (
    <section
      aria-label="Next 12 hours"
      className="wx-chart -mx-4 mt-3 overflow-hidden border-t pt-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="mb-1.5 flex items-baseline justify-between px-4">
        <h3
          className="text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Next {hours.length} hours
        </h3>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {tMin}° – {tMax}°
        </span>
      </div>

      <div className="relative px-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: H }}
          aria-hidden
        >
          <defs>
            {/* Curve fill — accent-tinted gradient that fades to
             *  paper at the chart baseline so the area read isn't
             *  a hard block of color. */}
            <linearGradient id="wx-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--app-accent)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--app-accent)" stopOpacity={0} />
            </linearGradient>
            {/* Precip bar — Carroll Creek slate. */}
            <linearGradient id="wx-precip" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--app-cool)" stopOpacity={0.9} />
              <stop offset="100%" stopColor="var(--app-cool)" stopOpacity={0.55} />
            </linearGradient>
          </defs>

          {/* Filled area beneath the line. Fade in after the line
           *  finishes drawing for a clean reveal. */}
          <path d={fillPath} fill="url(#wx-fill)" className="wx-curve-fill" />

          {/* Precip bars — one per hour, scaled by % chance. Each
           *  bar sits in a 22u-tall band at the bottom of the chart
           *  so it can't push into the temp curve. */}
          {hours.map((h, i) => {
            const pct = Math.max(0, Math.min(100, h.probabilityOfPrecipitation ?? 0));
            if (pct < 5) return null;
            const barH = (pct / 100) * 20;
            const cx = xFor(i);
            return (
              <rect
                key={`bar-${i}`}
                x={cx - 5}
                y={H - PAD_BOTTOM + 4 + (20 - barH)}
                width={10}
                height={barH}
                rx={2}
                fill="url(#wx-precip)"
                className="wx-bar"
                style={{ animationDelay: `${0.6 + i * 0.04}s` }}
              />
            );
          })}

          {/* The temperature line — drawn on via stroke-dashoffset. */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--app-brand)"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="wx-curve"
          />

          {/* Now marker — a single static dot with a paper-cream
           *  outline so it reads as "you are here" without the
           *  expanding-ring effect that was reading as alarmy. */}
          <circle
            cx={xFor(nowIdx)}
            cy={yFor(temps[nowIdx])}
            r={4}
            fill="var(--app-brand)"
            stroke="var(--app-bg-elevated-solid)"
            strokeWidth={2}
          />
        </svg>

        {/* Hour cells — temp + glyph + hour for each tick. Absolutely
         *  positioned so they align with the SVG's xFor() math. The
         *  temperature is the primary read (top), the glyph adds
         *  conditions, and the hour anchors it in time. Apple Weather
         *  uses the same stacking. */}
        <div className="relative mt-1 h-12">
          {hours.map((h, i) => {
            const Hi = ICONS[iconForShortForecast(h.shortForecast)];
            const pct = h.probabilityOfPrecipitation ?? 0;
            // Translate the SVG xFor() value (in viewBox units, 0..W)
            // to a CSS left % so the cells track the curve regardless
            // of card width.
            const leftPct = ((xFor(i) / W) * 100).toFixed(2);
            const isNow = i === nowIdx;
            return (
              <div
                key={`cell-${i}`}
                className="wx-hour-cell absolute -translate-x-1/2 flex flex-col items-center gap-0.5"
                style={{
                  left: `${leftPct}%`,
                  animationDelay: `${0.4 + i * 0.04}s`,
                }}
              >
                <span
                  className="text-[11px] font-semibold tabular-nums leading-none"
                  style={{ color: isNow ? "var(--app-brand)" : "var(--app-ink)" }}
                >
                  {h.temperature}°
                </span>
                <Hi
                  className="h-3 w-3"
                  strokeWidth={2}
                  style={{ color: isNow ? "var(--app-brand)" : "var(--app-ink-3)" }}
                  aria-hidden
                />
                <span
                  className="text-[9px] font-semibold tabular-nums leading-none"
                  style={{ color: isNow ? "var(--app-ink)" : "var(--app-ink-3)" }}
                >
                  {hourLabel(h.startTime)}
                </span>
                {pct >= 30 && (
                  <span
                    className="text-[8px] font-semibold tabular-nums leading-none"
                    style={{ color: "var(--app-cool)" }}
                  >
                    {pct}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
