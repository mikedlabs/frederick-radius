"use client";

import { useMemo, useState } from "react";
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
  ChevronDown,
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

// One tint per condition so the hourly rail reads at a glance — warm
// for sun, cool for rain, neutral for cloud. Keeps the rail from
// becoming a flat gray streak.
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
 * WeatherHourlyChart — touch-interactive hourly rail with a sparkline
 * trend above and tap-to-reveal hour details below.
 *
 * Replaces the prior server-rendered SVG with absolutely-positioned
 * hour cells (which read flat and gave no affordance to interact).
 *
 * Visual layers, top to bottom:
 *   1. Tiny eyebrow — "Next 12 hours" + range
 *   2. Sparkline — a thin SVG temp curve across all 12 hours
 *      with subtle precip dots; reads as the trend at a glance
 *   3. Hour rail — a horizontally-scrollable scroll-snap row of one
 *      "candle" per hour. Each candle: tiny weekday-style hour label,
 *      glyph tinted by condition, big temp, precip-% chip if ≥30%.
 *      The "now" candle has a brand-tinted outline + sticky-feeling
 *      anchor. Scroll-snap-x mandatory so each candle locks under
 *      the thumb on touch.
 *   4. Detail card — appears when the user taps a candle, showing
 *      that hour's short forecast, wind, precip, full clock label.
 *
 * Client component (the prior was server-only) because the tap-to-
 * reveal interaction is the whole point. The sparkline and rail are
 * static-friendly; the detail card uses simple useState. No animation
 * libraries — CSS transitions only, respects prefers-reduced-motion.
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
  // The "currently selected hour" for the detail card. Defaults to the
  // first hour (which is the current hour from the NWS API).
  const [activeIdx, setActiveIdx] = useState<number>(0);

  // Sparkline geometry computed once. Stable as long as the prop
  // doesn't change — which is per page load, since the hourly NWS data
  // refreshes only on parent revalidation.
  const spark = useMemo(() => {
    if (hours.length === 0) return null;
    const W = 320;
    const H = 32;
    const PAD = 4;
    const n = hours.length;
    const temps = hours.map((h) => h.temperature);
    let tMin = Math.min(...temps);
    let tMax = Math.max(...temps);
    if (tMin === tMax) {
      tMin -= 1;
      tMax += 1;
    }
    const xFor = (i: number) => PAD + ((W - 2 * PAD) * i) / Math.max(1, n - 1);
    const yFor = (t: number) =>
      PAD + (H - 2 * PAD) * (1 - (t - tMin) / Math.max(1, tMax - tMin));
    const linePath = temps
      .map(
        (t, i) =>
          `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(t).toFixed(1)}`,
      )
      .join(" ");
    const fillPath =
      linePath +
      ` L ${xFor(n - 1).toFixed(1)} ${H - PAD} L ${xFor(0).toFixed(1)} ${H - PAD} Z`;
    return { W, H, PAD, xFor, yFor, linePath, fillPath, tMin, tMax };
  }, [hours]);

  if (hours.length === 0 || !spark) return null;

  const active = hours[activeIdx];
  const ActiveIcon = ICONS[iconForShortForecast(active.shortForecast)];
  const activePct = active.probabilityOfPrecipitation ?? 0;

  return (
    <section
      aria-label={`Next ${hours.length} hours`}
      className="mt-3 -mx-4 border-t pt-2.5"
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
          {spark.tMin}° – {spark.tMax}°
        </span>
      </div>

      {/* Sparkline — the at-a-glance trend. Reads "warming up", "rain
          coming", "flat" without the user doing any work. */}
      <div className="px-4">
        <svg
          viewBox={`0 0 ${spark.W} ${spark.H}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: spark.H }}
          aria-hidden
        >
          <defs>
            <linearGradient id="wx-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--app-accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--app-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={spark.fillPath} fill="url(#wx-spark-fill)" />
          <path
            d={spark.linePath}
            fill="none"
            stroke="var(--app-brand)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Precip dots — only for hours with ≥30% chance. A whisper,
              not a full bar chart. */}
          {hours.map((h, i) => {
            const pct = h.probabilityOfPrecipitation ?? 0;
            if (pct < 30) return null;
            return (
              <circle
                key={`spark-precip-${i}`}
                cx={spark.xFor(i)}
                cy={spark.H - 2}
                r={1.8}
                fill="var(--app-cool)"
                opacity={Math.min(1, 0.4 + pct / 200)}
              />
            );
          })}
          {/* Selected-hour anchor — vertical hairline tying the
              sparkline to the candle the user has open. */}
          <line
            x1={spark.xFor(activeIdx)}
            y1={2}
            x2={spark.xFor(activeIdx)}
            y2={spark.H - 2}
            stroke="var(--app-brand)"
            strokeOpacity={0.5}
            strokeWidth={1.25}
            strokeDasharray="2 2"
          />
          <circle
            cx={spark.xFor(activeIdx)}
            cy={spark.yFor(hours[activeIdx].temperature)}
            r={2.75}
            fill="var(--app-brand)"
            stroke="var(--app-bg-elevated-solid)"
            strokeWidth={1.5}
          />
        </svg>
      </div>

      {/* Hour rail — horizontally scrollable, scroll-snap mandatory so
          each candle locks under the user's thumb on touch. Hidden
          scrollbar; the scroll IS the affordance. */}
      <div
        className="scrollbar-hide mt-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-4 py-2"
        role="tablist"
        aria-label="Hourly forecast"
      >
        {hours.map((h, i) => {
          const k = iconForShortForecast(h.shortForecast);
          const Hi = ICONS[k];
          const pct = h.probabilityOfPrecipitation ?? 0;
          const isActive = i === activeIdx;
          const isNow = i === 0;
          return (
            <button
              key={h.startTime}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-label={`${fullClockLabel(h.startTime)} · ${h.temperature}° · ${h.shortForecast}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveIdx(i);
              }}
              className="wx-hour group relative flex shrink-0 snap-center flex-col items-center gap-1 rounded-[12px] px-2.5 py-2 text-center transition-[background,border-color,transform] duration-150 active:scale-[0.97]"
              style={{
                minWidth: "44px",
                background: isActive
                  ? "color-mix(in srgb, var(--app-brand) 12%, var(--app-bg-elevated))"
                  : "var(--app-bg-elevated)",
                border: `1px solid ${
                  isActive
                    ? "color-mix(in srgb, var(--app-brand) 55%, transparent)"
                    : "var(--app-border)"
                }`,
              }}
            >
              <span
                className="text-[9.5px] font-semibold uppercase tracking-[0.05em] tabular-nums leading-none"
                style={{
                  color: isNow
                    ? "var(--app-brand)"
                    : isActive
                      ? "var(--app-ink-2)"
                      : "var(--app-ink-3)",
                }}
              >
                {isNow ? "Now" : hourLabel(h.startTime)}
              </span>
              <Hi
                className="h-4 w-4"
                strokeWidth={2}
                style={{
                  color: TINT[k],
                  filter: isActive ? "none" : "saturate(0.85)",
                }}
                aria-hidden
              />
              <span
                className="text-[14px] font-semibold tabular-nums leading-none"
                style={{ color: "var(--app-ink)" }}
              >
                {h.temperature}°
              </span>
              {pct >= 30 ? (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-1 py-[1px] text-[8.5px] font-semibold tabular-nums leading-none"
                  style={{
                    background: "color-mix(in srgb, var(--app-cool) 18%, transparent)",
                    color: "var(--app-cool)",
                  }}
                >
                  <Droplets className="h-2 w-2" strokeWidth={2.25} aria-hidden />
                  {pct}
                </span>
              ) : (
                // Reserve the slot so the candles stay the same height
                // and the rail doesn't jitter as the user scrolls.
                <span className="h-[12px] w-px" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* Detail card — the "reveal" for the selected hour. Same paper
          tone as the parent card so it reads as a connected panel,
          not a popup. */}
      <div
        className="wx-detail mx-4 mt-1 flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5 transition-[background] duration-200"
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

      {/* Scroll affordance — a hairline arrow nudge below the rail
          telling the user the rail keeps going. Fades on the right
          edge to suggest motion. */}
      <p
        className="mt-1 flex items-center justify-center gap-1 text-[9.5px] uppercase tracking-[0.1em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <span>Tap an hour · swipe for more</span>
        <ChevronDown className="h-2.5 w-2.5 rotate-[-90deg]" strokeWidth={2.5} aria-hidden />
      </p>
    </section>
  );
}
