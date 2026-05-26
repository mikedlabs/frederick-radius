"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind as WindIcon,
  Droplets,
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
  Wind: WindIcon,
} as const;

const TINT: Record<keyof typeof ICONS, string> = {
  Sun: "#E8A33D",
  CloudSun: "#C99632",
  Cloud: "#8A8884",
  CloudRain: "#2F5470",
  CloudSnow: "#7CA8D8",
  CloudLightning: "#7E2C6F",
  CloudFog: "#9A9690",
  Wind: "#4A7CA8",
};

/**
 * WeatherHourlyChart — Weathergraph-style single-strip chart.
 *
 * Replaces the previous candle-rail (12 tiles) with a single
 * continuous chart that combines four layers in one timeline:
 *
 *   - Daylight backing: per-hour isDaytime gradient (warm-cream
 *     during day, cool-cream at night) so the chart itself reads
 *     "where we are in the day" without numbers.
 *   - Temperature curve: a smooth slate→brick gradient stroke, with
 *     the day's Hi and Lo labels floating directly on the curve
 *     (NYT/FT "direct labels on lines" — no legend, no axis).
 *   - Precip bars: slate columns at the baseline for any hour with
 *     ≥20% rain probability. Subtle by default, louder past 50%.
 *   - Scrub indicator: a vertical hairline + a brand dot that
 *     follows the user's finger / mouse across the chart.
 *
 * Interaction: drag a finger across the chart (or tap an hour) to
 * scrub through the 12-hour window. The detail card below updates
 * with the touched hour's conditions, wind, and clock label. No
 * snap; the scrub feels analog. A "Now"-marker triangle sits
 * pinned to hour 0 as the anchor.
 *
 * Owner ask (verbatim): "add some sort of motion control so the
 * user can can see it if they wanna touch it. Make it a little bit
 * more interactive so it doesn't have to take up so much space,
 * but it looks pretty when you reveal different parts of the
 * weather." The scrub is the motion control; one strip is the
 * compactness; the layered backing is the pretty.
 */

type Props = {
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

function fullClockLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function WeatherHourlyChart({ hours }: Props) {
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const railRef = useRef<HTMLDivElement | null>(null);

  // SVG geometry — generous viewBox lets the curve breathe and the
  // floating labels sit above the peak / below the trough without
  // running into the day/night backing.
  const geo = useMemo(() => {
    if (hours.length === 0) return null;
    const W = 360;
    const H = 110;
    const PAD_X = 14;
    const PAD_TOP = 24; // room for the floating Hi label
    const PAD_BOTTOM = 26; // room for hour labels + precip bars
    const n = hours.length;
    const temps = hours.map((h) => h.temperature);
    let tMin = Math.min(...temps);
    let tMax = Math.max(...temps);
    if (tMin === tMax) {
      tMin -= 1;
      tMax += 1;
    }
    const usableH = H - PAD_TOP - PAD_BOTTOM;
    const xFor = (i: number) => PAD_X + ((W - 2 * PAD_X) * i) / Math.max(1, n - 1);
    const yFor = (t: number) =>
      PAD_TOP + usableH * (1 - (t - tMin) / Math.max(1, tMax - tMin));

    // Catmull-Rom → cubic Bezier for a smooth curve through the
    // 12 points. Reads as a weather phenomenon, not a polyline.
    const pts = temps.map((t, i) => [xFor(i), yFor(t)] as const);
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    const fill = `${d} L ${pts[pts.length - 1][0]} ${H - PAD_BOTTOM} L ${pts[0][0]} ${H - PAD_BOTTOM} Z`;

    // Hi / Lo anchor indices for the floating labels.
    let hiIdx = 0;
    let loIdx = 0;
    for (let i = 1; i < temps.length; i++) {
      if (temps[i] > temps[hiIdx]) hiIdx = i;
      if (temps[i] < temps[loIdx]) loIdx = i;
    }

    // Daylight stops for the background gradient — one stop per
    // hour, transitioning between warm (day) and cool (night) cream
    // tints. Each stop offset is the hour's x position as %.
    const dayStops = hours.map((h, i) => ({
      offset: ((xFor(i) - PAD_X) / (W - 2 * PAD_X)) * 100,
      color: h.isDaytime
        ? "color-mix(in srgb, var(--app-accent) 14%, var(--app-bg-elevated-solid))"
        : "color-mix(in srgb, var(--app-cool) 12%, var(--app-bg-elevated-solid))",
    }));

    return {
      W, H, PAD_X, PAD_TOP, PAD_BOTTOM, n, xFor, yFor, d, fill,
      tMin, tMax, hiIdx, loIdx, dayStops,
    };
  }, [hours]);

  // Map an event's x coordinate inside the chart to an hour index.
  const idxFromEvent = useCallback(
    (clientX: number): number | null => {
      const el = railRef.current;
      if (!el || !geo) return null;
      const rect = el.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const xInView = (relativeX / rect.width) * geo.W;
      const usable = geo.W - 2 * geo.PAD_X;
      const ratio = Math.max(0, Math.min(1, (xInView - geo.PAD_X) / usable));
      return Math.round(ratio * (geo.n - 1));
    },
    [geo],
  );

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only react to actual presses/drags, not idle moves over the chart.
      if (e.buttons === 0 && e.type !== "pointerdown") return;
      const idx = idxFromEvent(e.clientX);
      if (idx != null && idx !== activeIdx) setActiveIdx(idx);
    },
    [idxFromEvent, activeIdx],
  );

  if (!geo || hours.length === 0) return null;

  const active = hours[activeIdx];
  const ActiveIcon = ICONS[iconForShortForecast(active.shortForecast)];
  const activePct = active.probabilityOfPrecipitation ?? 0;
  const ax = geo.xFor(activeIdx);

  return (
    <section
      aria-label={`Next ${hours.length} hours`}
      className="-mx-4 mt-3 border-t pt-2.5"
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
          {geo.tMin}° – {geo.tMax}°
        </span>
      </div>

      <div
        ref={railRef}
        className="relative cursor-pointer touch-pan-y select-none px-4"
        role="slider"
        aria-label="Scrub through the next 12 hours"
        aria-valuemin={0}
        aria-valuemax={hours.length - 1}
        aria-valuenow={activeIdx}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          handlePointer(e);
        }}
        onPointerMove={handlePointer}
        onPointerUp={(e) => {
          (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        }}
      >
        <svg
          viewBox={`0 0 ${geo.W} ${geo.H}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: geo.H }}
          aria-hidden
        >
          <defs>
            {/* Daylight gradient — warm cream during isDaytime hours,
             *  cool cream at night. The chart itself shows you where
             *  the sun is. */}
            <linearGradient
              id="wx-daylight"
              x1={geo.PAD_X}
              y1={0}
              x2={geo.W - geo.PAD_X}
              y2={0}
              gradientUnits="userSpaceOnUse"
            >
              {geo.dayStops.map((s, i) => (
                <stop key={i} offset={`${s.offset.toFixed(2)}%`} stopColor={s.color} />
              ))}
            </linearGradient>
            {/* Temp-curve fill — fades from accent tint to nothing.
             *  Reads as the "weight" of the day's heat. */}
            <linearGradient id="wx-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--app-brand)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--app-brand)" stopOpacity={0} />
            </linearGradient>
            {/* Temp-curve stroke — slate at the low end, brick at the
             *  high end. The line itself encodes value. */}
            <linearGradient
              id="wx-line"
              x1={geo.PAD_X}
              y1={geo.PAD_TOP}
              x2={geo.PAD_X}
              y2={geo.H - geo.PAD_BOTTOM}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="var(--app-brand)" />
              <stop offset="100%" stopColor="var(--app-cool)" />
            </linearGradient>
            {/* Precip bar gradient — slate fading at top so the bars
             *  feel weather-y, not bar-chart-y. */}
            <linearGradient id="wx-precip" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--app-cool)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="var(--app-cool)" stopOpacity={0.9} />
            </linearGradient>
          </defs>

          {/* Daylight backing — single rect filled with the per-hour
           *  stop gradient. */}
          <rect
            x={geo.PAD_X}
            y={geo.PAD_TOP - 4}
            width={geo.W - 2 * geo.PAD_X}
            height={geo.H - geo.PAD_TOP - geo.PAD_BOTTOM + 8}
            fill="url(#wx-daylight)"
            rx={8}
          />

          {/* Precip bars at the baseline. */}
          {hours.map((h, i) => {
            const pct = h.probabilityOfPrecipitation ?? 0;
            if (pct < 20) return null;
            const barH = Math.max(2, (pct / 100) * 18);
            const cx = geo.xFor(i);
            return (
              <rect
                key={`bar-${i}`}
                x={cx - 4}
                y={geo.H - geo.PAD_BOTTOM - barH + 4}
                width={8}
                height={barH}
                rx={1.5}
                fill="url(#wx-precip)"
                opacity={Math.min(1, 0.4 + pct / 150)}
              />
            );
          })}

          {/* Temp curve — area + line. */}
          <path d={geo.fill} fill="url(#wx-fill)" />
          <path
            d={geo.d}
            fill="none"
            stroke="url(#wx-line)"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hi/Lo direct labels — both float ABOVE their points so
           *  they form a clean "ribbon of values" along the top of
           *  the curve without colliding with the precip bars or the
           *  bottom tick labels. Horizontal text-anchor flips at the
           *  chart edges so the label stays inside the box. */}
          {(() => {
            const labelAt = (idx: number, color: string) => {
              const x = geo.xFor(idx);
              const y = geo.yFor(hours[idx].temperature);
              // Anchor end/start at the edges so the text reads inside
              // the chart, not chopped off at the viewBox boundary.
              const anchor =
                idx === 0 ? "start" : idx === geo.n - 1 ? "end" : "middle";
              const dx = idx === 0 ? 2 : idx === geo.n - 1 ? -2 : 0;
              return (
                <text
                  key={`label-${idx}`}
                  x={x + dx}
                  y={Math.max(geo.PAD_TOP - 4, y - 8)}
                  textAnchor={anchor}
                  fill={color}
                  fontWeight={600}
                  fontSize={11}
                >
                  {hours[idx].temperature}°
                </text>
              );
            };
            // Skip the Lo label if it sits on the same hour as Hi (a
            // perfectly flat curve, very rare) — one label is enough.
            return (
              <>
                {labelAt(geo.hiIdx, "var(--app-brand)")}
                {geo.loIdx !== geo.hiIdx && labelAt(geo.loIdx, "var(--app-cool)")}
              </>
            );
          })()}

          {/* Now marker — small triangle pinned to hour 0 so the
           *  reader knows where the present sits in the strip. */}
          <polygon
            points={`${geo.xFor(0) - 4},${geo.H - geo.PAD_BOTTOM + 6} ${geo.xFor(0) + 4},${geo.H - geo.PAD_BOTTOM + 6} ${geo.xFor(0)},${geo.H - geo.PAD_BOTTOM + 1}`}
            fill="var(--app-brand)"
          />

          {/* Scrub indicator — vertical hairline + brand dot at the
           *  selected hour. */}
          <line
            x1={ax}
            y1={geo.PAD_TOP - 2}
            x2={ax}
            y2={geo.H - geo.PAD_BOTTOM + 2}
            stroke="var(--app-brand)"
            strokeOpacity={activeIdx === 0 ? 0.4 : 0.7}
            strokeWidth={1.25}
            strokeDasharray={activeIdx === 0 ? "2 3" : "0"}
          />
          <circle
            cx={ax}
            cy={geo.yFor(hours[activeIdx].temperature)}
            r={4}
            fill="var(--app-brand)"
            stroke="var(--app-bg-elevated-solid)"
            strokeWidth={2}
          />

          {/* Hour tick labels — only first, midpoint, and last to
           *  keep the chart calm. The scrub-detail card fills in the
           *  exact hour the user is examining. */}
          {[0, Math.floor(hours.length / 2), hours.length - 1].map((i) => (
            <text
              key={`tick-${i}`}
              x={geo.xFor(i)}
              y={geo.H - 6}
              textAnchor="middle"
              fontSize={9.5}
              fill="var(--app-ink-3)"
              style={{ fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {i === 0 ? "Now" : hourLabel(hours[i].startTime)}
            </text>
          ))}
        </svg>
      </div>

      {/* Detail card — updates as the user scrubs. Same paper-cream
       *  tone as the parent so it reads as a connected surface. */}
      <div
        className="wx-detail mx-4 mt-2 flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
        style={{
          background: "color-mix(in srgb, var(--app-brand) 4%, var(--app-bg-elevated))",
          borderColor: "var(--app-border)",
        }}
        aria-live="polite"
      >
        <ActiveIcon
          className="h-7 w-7 shrink-0"
          strokeWidth={1.75}
          style={{ color: TINT[iconForShortForecast(active.shortForecast)] }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[13px] font-semibold leading-none"
              style={{ color: "var(--app-ink)" }}
            >
              {activeIdx === 0 ? "Now" : fullClockLabel(active.startTime)}
            </span>
            <span
              className="text-[13px] font-semibold tabular-nums leading-none"
              style={{ color: "var(--app-ink-2)" }}
            >
              · {active.temperature}°
            </span>
          </div>
          <p
            className="mt-1 truncate text-[11.5px] leading-snug"
            style={{ color: "var(--app-ink-3)" }}
          >
            {active.shortForecast}
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-2 text-[10.5px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {active.windSpeed ? (
            <span className="inline-flex items-center gap-0.5">
              <WindIcon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              {active.windSpeed}
            </span>
          ) : null}
          {activePct >= 10 ? (
            <span
              className="inline-flex items-center gap-0.5 font-semibold"
              style={{ color: activePct >= 50 ? "var(--app-cool)" : undefined }}
            >
              <Droplets className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              {activePct}%
            </span>
          ) : null}
        </div>
      </div>

      <p
        className="mt-1.5 px-4 text-center text-[9.5px] uppercase tracking-[0.1em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Drag to scrub · the dot is the hour you&apos;re reading
      </p>
    </section>
  );
}
