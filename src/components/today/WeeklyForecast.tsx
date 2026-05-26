"use client";

import { useState } from "react";
import {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
  ChevronDown, Droplets,
} from "lucide-react";
import { iconForShortForecast, type NwsHourly } from "@/lib/integrations/nws";

const ICONS = { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind } as const;
const ICON_TINT: Record<keyof typeof ICONS, string> = {
  Sun: "#E8A33D", CloudSun: "#C99632", Cloud: "#8A8884", CloudRain: "#2F5470",
  CloudSnow: "#7CA8D8", CloudLightning: "#7E2C6F", CloudFog: "#9A9690", Wind: "#4A7CA8",
};

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

function weekday(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(iso));
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
    if (!byKey.has(k)) { byKey.set(k, []); order.push(k); }
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
 * The 7-day outlook, rendered as a frosted sub-panel of the weather
 * card. Brings the new weather-hero design language down to the week:
 *
 *   - Always-visible 7-cell strip: weekday label, animated reveal
 *     glyph, hi temperature.
 *   - Hi-temperature SVG curve spanning the strip, drawn-on with the
 *     same stroke-dashoffset transition as the hourly chart (.wx-curve)
 *     so the two read as one weather system.
 *   - Tiny precip dot under any day with >=20% chance.
 *   - Tap header to expand: per-day detail rows below (short forecast +
 *     hi/lo + precip badge).
 *
 * `tone` is the parent card's light/dark tone so the type sits
 * legibly on the same gradient as the hourly strip.
 */
export default function WeeklyForecast({
  daily,
  tone,
}: {
  daily: NwsHourly[];
  tone: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const days = groupDays(daily);
  if (days.length === 0) return null;

  const ink = tone === "dark" ? "#FFFFFF" : "#1A1A1A";
  const ink2 = tone === "dark" ? "rgba(255,255,255,0.78)" : "rgba(26,26,26,0.62)";
  const ink3 = tone === "dark" ? "rgba(255,255,255,0.55)" : "rgba(26,26,26,0.42)";
  const panel = tone === "dark" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.45)";
  const hairline = tone === "dark" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)";
  const cool = tone === "dark" ? "#9CC4E8" : "#2F5470";
  const brand = tone === "dark" ? "#E8A33D" : "#A8462C";
  const fill = tone === "dark"
    ? "color-mix(in srgb, #E8A33D 24%, transparent)"
    : "color-mix(in srgb, #A8462C 18%, transparent)";

  // Build the SVG strip geometry — same xFor/yFor pattern as the
  // hourly chart so the visual language stays consistent across
  // the weather card. Hi temperatures define the curve; lows are
  // shown as numerals only.
  const W = 350;
  const H = 70;
  const PAD_X = 14;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 30; // breathing room for the day-label row
  const n = days.length;
  const step = (W - 2 * PAD_X) / Math.max(1, n - 1);

  const tempsWithValues = days.map((d) => d.hi).filter((v): v is number => v != null);
  let tMin = tempsWithValues.length ? Math.min(...tempsWithValues) : 50;
  let tMax = tempsWithValues.length ? Math.max(...tempsWithValues) : 75;
  if (tMin === tMax) { tMin -= 2; tMax += 2; }
  tMin = Math.floor(tMin - 2);
  tMax = Math.ceil(tMax + 2);

  const xFor = (i: number) => PAD_X + i * step;
  const yFor = (t: number) => {
    const usable = H - PAD_TOP - PAD_BOTTOM;
    const ratio = (t - tMin) / (tMax - tMin);
    return PAD_TOP + (1 - ratio) * usable;
  };

  // Build the line + fill paths, falling through nulls (rare for the
  // NWS 14-period set but defensive).
  const points: Array<{ x: number; y: number } | null> = days.map((d, i) =>
    d.hi != null ? { x: xFor(i), y: yFor(d.hi) } : null,
  );
  const valid = points.filter((p): p is { x: number; y: number } => p != null);
  const linePath = valid
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const fillPath = valid.length >= 2
    ? linePath
      + ` L ${valid[valid.length - 1].x.toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)}`
      + ` L ${valid[0].x.toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} Z`
    : "";

  // Today index — the first day labeled "Today" wins.
  const todayIdx = days.findIndex((d) => d.label === "Today");

  return (
    <div
      className="mt-px"
      style={{ background: panel, backdropFilter: "blur(2px)" }}
    >
      {/* Always-visible 7-day strip: SVG hi-temp curve over a row of
          day cells. The whole strip sits under a single tap target so
          the expand affordance covers the full width. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Collapse 7-day outlook" : "Expand 7-day outlook"}
        className="block w-full text-left transition active:scale-[0.997]"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-2.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: ink2 }}>
            7-day outlook
          </span>
          <span className="flex items-center gap-1.5 text-[10px] tabular-nums" style={{ color: ink3 }}>
            <span>{tMin}° – {tMax}°</span>
            <ChevronDown
              className="h-3 w-3 transition-transform"
              strokeWidth={2.5}
              style={{ color: ink3, transform: open ? "rotate(180deg)" : "none" }}
              aria-hidden
            />
          </span>
        </div>

        <div className="relative px-4 pb-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height: H }}
            aria-hidden
          >
            <defs>
              <linearGradient id="wf-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={brand} stopOpacity={tone === "dark" ? 0.4 : 0.32} />
                <stop offset="100%" stopColor={brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            {fillPath && <path d={fillPath} fill="url(#wf-fill)" className="wx-curve-fill" />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={brand}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="wx-curve"
              />
            )}
            {/* Dots at each day's hi point. Today's dot is a touch
             *  larger with a paper-cream outline so the "you are here"
             *  anchor matches the hourly chart — static dot only, no
             *  expanding ring (which was reading as alarmy). */}
            {points.map((p, i) => {
              if (!p) return null;
              const isToday = i === todayIdx;
              return (
                <circle
                  key={`pt-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={isToday ? 4 : 2.5}
                  fill={isToday ? brand : fill}
                  stroke={isToday ? "var(--app-bg-elevated-solid)" : brand}
                  strokeWidth={isToday ? 2 : 1.2}
                />
              );
            })}
            {/* Precip dot row — sits in the bottom margin under each
                day with >=20% precip chance. */}
            {days.map((d, i) =>
              d.precip >= 20 ? (
                <circle
                  key={`pp-${i}`}
                  cx={xFor(i)}
                  cy={H - PAD_BOTTOM + 14}
                  r={Math.min(3.5, 1.5 + d.precip / 28)}
                  fill={cool}
                />
              ) : null,
            )}
          </svg>

          {/* Day labels — absolutely positioned to track xFor() math. */}
          <div className="relative mt-1 h-7">
            {days.map((d, i) => {
              const leftPct = ((xFor(i) / W) * 100).toFixed(2);
              const isToday = i === todayIdx;
              const k = iconForShortForecast(d.short);
              const Icon = ICONS[k];
              return (
                <div
                  key={`lbl-${i}`}
                  className="wx-hour-cell absolute -translate-x-1/2 flex flex-col items-center gap-0.5"
                  style={{
                    left: `${leftPct}%`,
                    animationDelay: `${0.4 + i * 0.06}s`,
                  }}
                >
                  <Icon
                    className="h-3 w-3"
                    strokeWidth={2}
                    style={{ color: isToday ? brand : ink3 }}
                    aria-hidden
                  />
                  <span
                    className="text-[9.5px] font-semibold tabular-nums tracking-tight"
                    style={{ color: isToday ? ink : ink2 }}
                  >
                    {d.label}
                  </span>
                  <span
                    className="text-[10px] font-bold tabular-nums leading-none"
                    style={{ color: isToday ? brand : ink }}
                  >
                    {d.hi != null ? `${d.hi}°` : "–"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </button>

      {/* Expanded detail — full short forecast + hi/lo + precip for
          users who want the textual outlook. */}
      {open && (
        <ul style={{ borderTop: `1px solid ${hairline}` }}>
          {days.map((d) => {
            const k = iconForShortForecast(d.short);
            const Icon = ICONS[k];
            return (
              <li
                key={d.key}
                className="flex items-center gap-3 px-4 py-2"
                style={{ borderTop: `1px solid ${hairline}` }}
              >
                <span className="w-9 shrink-0 text-[12px] font-semibold" style={{ color: ink }}>
                  {d.label}
                </span>
                <Icon
                  className="h-4 w-4 shrink-0"
                  strokeWidth={1.75}
                  style={{ color: tone === "dark" ? "#fff" : ICON_TINT[k] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: ink2 }}>
                  {d.short}
                </span>
                {d.precip > 15 && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums" style={{ color: cool }}>
                    <Droplets className="h-3 w-3" strokeWidth={2} aria-hidden />
                    {d.precip}%
                  </span>
                )}
                <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums" style={{ color: ink }}>
                  {d.hi != null ? `${d.hi}°` : "–"}
                  <span style={{ color: ink3 }}> {d.lo != null ? `${d.lo}°` : "–"}</span>
                </span>
              </li>
            );
          })}
          <li
            className="px-4 py-1.5 text-[9px] uppercase tracking-[0.1em]"
            style={{ color: ink3, borderTop: `1px solid ${hairline}` }}
          >
            National Weather Service · Frederick
          </li>
        </ul>
      )}
    </div>
  );
}
