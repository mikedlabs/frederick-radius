"use client";

import { useState } from "react";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
  Droplets,
  ChevronDown,
} from "lucide-react";
import { iconForShortForecast, type NwsHourly } from "@/lib/integrations/nws";

const ICONS = {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
} as const;
// Single tint table; the parent card uses paper-cream tones in light
// mode and warm-dark in dark mode, both of which read well against
// these condition-coded hues. The prior tone="light|dark" parameter
// was a workaround for a card that doesn't exist anymore.
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

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function weekday(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date(iso));
}

type Day = {
  key: string;
  label: string;
  short: string;
  hi: number | null;
  lo: number | null;
  precip: number;
};

/** Group the day/night periods NWS returns into up to 7 calendar days. */
function groupDays(daily: NwsHourly[]): Day[] {
  const todayKey = dayKey(new Date().toISOString());
  const order: string[] = [];
  const byKey = new Map<string, NwsHourly[]>();
  for (const p of daily) {
    const k = dayKey(p.startTime);
    if (!byKey.has(k)) {
      byKey.set(k, []);
      order.push(k);
    }
    byKey.get(k)!.push(p);
  }
  return order.slice(0, 7).map((k) => {
    const periods = byKey.get(k)!;
    const day = periods.find((p) => p.isDaytime);
    const night = periods.find((p) => !p.isDaytime);
    const lead = day ?? night ?? periods[0];
    return {
      key: k,
      label: k === todayKey ? "Today" : weekday(lead.startTime),
      short: (day ?? night)?.shortForecast ?? "",
      hi: day ? day.temperature : null,
      lo: night ? night.temperature : null,
      precip: Math.max(
        day?.probabilityOfPrecipitation ?? 0,
        night?.probabilityOfPrecipitation ?? 0,
      ),
    };
  });
}

/**
 * WeeklyForecast — 7-day outlook with show/hide and paper-cream tone.
 *
 * Lives beneath the hourly rail inside WeatherHero. Previously rendered
 * with `tone="dark"` on a now-paper-cream parent card, which left the
 * type washed out against the warm background. Now uses the standard
 * `--app-ink-*` tokens that auto-flip between light and dark mode.
 *
 * The default is collapsed to a peek row — "7 days · {min}°–{max}° ·
 * X with rain" — and the full row list reveals on tap. The owner has
 * asked twice for less vertical commitment up front and a button to
 * hide the 7-day; this is that. Tokenized, accessible, prefers-
 * reduced-motion-friendly.
 *
 * Hi/lo bar geometry, weekday/glyph/precip-pill row anatomy unchanged
 * from the prior version — that part was working.
 */
export default function WeeklyForecast({
  daily,
  defaultExpanded = false,
}: {
  daily: NwsHourly[];
  /** When true, the row list is open on first paint. Default false. */
  defaultExpanded?: boolean;
}) {
  const days = groupDays(daily);
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (days.length === 0) return null;

  // Week-wide hi/lo for the row hi-lo bars.
  const allHi = days.map((d) => d.hi).filter((v): v is number => v != null);
  const allLo = days.map((d) => d.lo).filter((v): v is number => v != null);
  const weekMax = allHi.length ? Math.max(...allHi) : 0;
  const weekMin = allLo.length ? Math.min(...allLo) : 0;
  const weekSpan = Math.max(1, weekMax - weekMin);
  // Peek summary: how many days have ≥30% precip?
  const wetDays = days.filter((d) => d.precip >= 30).length;

  return (
    <div className="mt-px">
      {/* Peek header — also the toggle. Visible label + a chevron that
          rotates on expand. Clicking anywhere on this row opens/closes. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="wx-week-list"
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition active:scale-[0.998]"
      >
        <span
          className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-2)" }}
        >
          7-day outlook
        </span>
        <span
          className="text-[10.5px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {weekMin}° – {weekMax}°
          {wetDays > 0 ? (
            <>
              {" · "}
              <span style={{ color: "var(--app-cool)" }}>
                {wetDays} {wetDays === 1 ? "day" : "days"} of rain
              </span>
            </>
          ) : null}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--app-brand)" }}
        >
          {expanded ? "Hide" : "Show"}
          <ChevronDown
            className="h-3 w-3 transition-transform duration-200"
            strokeWidth={2.5}
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            aria-hidden
          />
        </span>
      </button>

      {/* Ribbon-in-a-ribbon — Apple Weather's hi-lo bar adapted as a
          collapsed-peek visual. The full-width track is the week's
          range; each day's hi-lo sits inside it as a slate→brick
          segment; weekday labels below each segment. Today's segment
          gets a brand outline. The peek now SHOWS the story instead
          of summarizing it in numbers; expanding gives the per-row
          detail when wanted. Hidden while expanded — that's the row
          list's job. */}
      {!expanded && (
        <div className="px-4 pb-2.5" aria-hidden>
          <div
            className="relative h-3 w-full rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-ink-3) 12%, transparent)",
            }}
          >
            {days.map((d) => {
              const hi = d.hi ?? d.lo ?? weekMax;
              const lo = d.lo ?? hi - 5;
              const left = ((Math.min(hi, lo) - weekMin) / weekSpan) * 100;
              const width = (Math.abs(hi - lo) / weekSpan) * 100;
              const isToday = d.label === "Today";
              return (
                <span
                  key={`peek-${d.key}`}
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(2, width)}%`,
                    background:
                      "linear-gradient(90deg, var(--app-cool), var(--app-brand))",
                    boxShadow: isToday
                      ? "0 0 0 1.5px color-mix(in srgb, var(--app-brand) 50%, transparent)"
                      : "none",
                    opacity: isToday ? 1 : 0.78,
                  }}
                />
              );
            })}
          </div>
          <ul
            className="mt-1 grid text-[9.5px] font-semibold uppercase tracking-[0.06em]"
            style={{
              gridTemplateColumns: `repeat(${days.length}, 1fr)`,
              color: "var(--app-ink-3)",
            }}
          >
            {days.map((d) => (
              <li
                key={`peek-label-${d.key}`}
                className="text-center"
                style={{
                  color:
                    d.label === "Today" ? "var(--app-brand)" : undefined,
                }}
              >
                {d.label === "Today" ? "Today" : d.label.slice(0, 1)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {expanded && (
        <ul
          id="wx-week-list"
          className="wx-week-list px-2 pb-2"
        >
          {days.map((d) => {
            const isToday = d.label === "Today";
            const k = iconForShortForecast(d.short);
            const Icon = ICONS[k];

            const hi = d.hi ?? d.lo ?? weekMax;
            const lo = d.lo ?? hi - 5;
            const leftPct = ((Math.min(hi, lo) - weekMin) / weekSpan) * 100;
            const widthPct = (Math.abs(hi - lo) / weekSpan) * 100;

            return (
              <li
                key={d.key}
                className="grid items-center gap-2 rounded-[10px] px-2.5 py-2"
                style={{
                  gridTemplateColumns: "44px 22px 1fr 42px 36px",
                  background: isToday
                    ? "color-mix(in srgb, var(--app-brand) 8%, transparent)"
                    : "transparent",
                  borderTop: "1px solid var(--app-border)",
                }}
              >
                <span
                  className="text-[12.5px] font-semibold tracking-tight"
                  style={{
                    color: isToday ? "var(--app-brand)" : "var(--app-ink)",
                  }}
                >
                  {d.label}
                </span>

                <span aria-hidden className="flex justify-center">
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={1.75}
                    style={{ color: TINT[k] }}
                  />
                </span>

                <div
                  className="relative h-1.5 rounded-full"
                  style={{
                    background:
                      "color-mix(in srgb, var(--app-ink-3) 18%, transparent)",
                  }}
                  aria-hidden
                >
                  <span
                    className="absolute top-0 h-full rounded-full"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      background:
                        "linear-gradient(90deg, var(--app-cool), var(--app-brand))",
                      boxShadow: isToday
                        ? "0 0 0 1.5px color-mix(in srgb, var(--app-brand) 35%, transparent)"
                        : "none",
                    }}
                  />
                </div>

                <span
                  className="text-right text-[13.5px] font-semibold tabular-nums leading-none"
                  style={{
                    color: isToday ? "var(--app-brand)" : "var(--app-ink)",
                  }}
                >
                  {d.hi != null ? `${d.hi}°` : "—"}
                </span>

                <span className="flex justify-end">
                  {d.precip >= 30 ? (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[9.5px] font-semibold tabular-nums"
                      style={{
                        background:
                          "color-mix(in srgb, var(--app-cool) 16%, transparent)",
                        color: "var(--app-cool)",
                      }}
                    >
                      <Droplets
                        className="h-2.5 w-2.5"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                      {d.precip}%
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
          <li
            className="px-2.5 pt-2 text-[9.5px] uppercase tracking-[0.12em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            National Weather Service · Frederick
          </li>
        </ul>
      )}
    </div>
  );
}
