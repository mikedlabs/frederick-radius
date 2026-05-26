"use client";

import {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
  Droplets,
} from "lucide-react";
import { iconForShortForecast, type NwsHourly } from "@/lib/integrations/nws";

const ICONS = { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind } as const;
const ICON_TINT_LIGHT: Record<keyof typeof ICONS, string> = {
  Sun: "#E8A33D", CloudSun: "#C99632", Cloud: "#8A8884", CloudRain: "#2F5470",
  CloudSnow: "#7CA8D8", CloudLightning: "#7E2C6F", CloudFog: "#9A9690", Wind: "#4A7CA8",
};
const ICON_TINT_DARK: Record<keyof typeof ICONS, string> = {
  Sun: "#F2B854", CloudSun: "#E8A33D", Cloud: "#BFBAB1", CloudRain: "#9CC4E8",
  CloudSnow: "#B6D2EC", CloudLightning: "#B47AAB", CloudFog: "#BFBAB1", Wind: "#82A8C8",
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
 * The 7-day outlook, redesigned as a vertical row layout.
 *
 * Previous design was an SVG hi-temp curve with absolutely-positioned
 * day cells tracking the curve's xFor() math. The cells got cramped
 * and overlapped at narrow viewports; the strip became hard to scan
 * at a glance. (The brand-y curve was nice but cost legibility.)
 *
 * New design — seven full-width rows, scannable in one downward
 * sweep. Each row carries:
 *
 *   [weekday] [glyph]  [hi-lo gradient bar]  [hi°]  [precip pill if ≥30%]
 *
 * The hi-lo bar is a horizontal track positioned relative to the
 * week's overall hi/lo range — visually shows where this day's
 * temperature sits in context. Today's row gets a brand-tinted
 * background so it pops as "you are here."
 *
 * Honest about clipping: with 7 fixed-height rows there is no
 * absolute positioning, no SVG math, no responsive cleverness to
 * break — every row reads at every width.
 *
 * `tone` (light | dark) is the parent card's tone so type sits
 * legibly on the same gradient as the hourly chart.
 */
export default function WeeklyForecast({
  daily,
  tone,
}: {
  daily: NwsHourly[];
  tone: "light" | "dark";
}) {
  const days = groupDays(daily);
  if (days.length === 0) return null;

  const ink = tone === "dark" ? "#FFFFFF" : "var(--app-ink)";
  const ink2 = tone === "dark" ? "rgba(255,255,255,0.78)" : "var(--app-ink-2)";
  const ink3 = tone === "dark" ? "rgba(255,255,255,0.55)" : "var(--app-ink-3)";
  const panel = tone === "dark" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.45)";
  const hairline = tone === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)";
  const cool = tone === "dark" ? "#9CC4E8" : "var(--app-cool)";
  const brand = tone === "dark" ? "#E8A33D" : "var(--app-brand)";
  const todayBg = tone === "dark"
    ? "color-mix(in srgb, #E8A33D 12%, transparent)"
    : "color-mix(in srgb, var(--app-brand) 8%, transparent)";
  const tints = tone === "dark" ? ICON_TINT_DARK : ICON_TINT_LIGHT;

  // Compute the week's overall hi/lo so each row's bar is positioned
  // relative to a stable reference, not just its own day.
  const allHi = days.map((d) => d.hi).filter((v): v is number => v != null);
  const allLo = days.map((d) => d.lo).filter((v): v is number => v != null);
  const weekMax = allHi.length ? Math.max(...allHi) : 0;
  const weekMin = allLo.length ? Math.min(...allLo) : 0;
  const weekSpan = Math.max(1, weekMax - weekMin); // guard /0

  return (
    <div
      className="mt-px"
      style={{ background: panel, backdropFilter: "blur(2px)" }}
    >
      <header className="flex items-baseline justify-between gap-3 px-4 pt-2.5 pb-1">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: ink2 }}
        >
          7-day outlook
        </span>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: ink3 }}
        >
          {weekMin}° – {weekMax}°
        </span>
      </header>

      <ul className="px-2 pb-2">
        {days.map((d) => {
          const isToday = d.label === "Today";
          const k = iconForShortForecast(d.short);
          const Icon = ICONS[k];
          const iconColor = tone === "dark" ? "#fff" : tints[k];

          // Position of THIS day's bar within the week's range, 0–100%.
          // hi → end of the bar; lo → start. If lo is missing (rare —
          // last day's night period may not exist yet), use hi-5 as a
          // synthetic low so the bar still has visible length.
          const hi = d.hi ?? d.lo ?? weekMax;
          const lo = d.lo ?? (hi - 5);
          const leftPct = ((Math.min(hi, lo) - weekMin) / weekSpan) * 100;
          const widthPct = (Math.abs(hi - lo) / weekSpan) * 100;

          return (
            <li
              key={d.key}
              className="grid items-center gap-2 rounded-[10px] px-2.5 py-2"
              style={{
                gridTemplateColumns: "44px 22px 1fr 42px 36px",
                background: isToday ? todayBg : "transparent",
                borderTop: `1px solid ${hairline}`,
              }}
            >
              {/* Weekday */}
              <span
                className="text-[12.5px] font-semibold tracking-tight"
                style={{ color: isToday ? brand : ink }}
              >
                {d.label}
              </span>

              {/* Glyph */}
              <span aria-hidden className="flex justify-center">
                <Icon
                  className="h-[18px] w-[18px]"
                  strokeWidth={1.75}
                  style={{ color: iconColor }}
                />
              </span>

              {/* Hi-lo gradient bar — visualizes where this day's
                  temperature range sits inside the week's overall
                  range. The track is a faint hairline; the filled
                  segment is a cool→warm gradient that signals "lows
                  are cool, highs are warm" at a glance. */}
              <div
                className="relative h-1.5 rounded-full"
                style={{ background: hairline }}
                aria-hidden
              >
                <span
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    background: `linear-gradient(90deg, ${cool}, ${brand})`,
                    boxShadow: isToday
                      ? `0 0 0 1.5px color-mix(in srgb, ${brand} 35%, transparent)`
                      : "none",
                  }}
                />
              </div>

              {/* Hi temperature — primary read for each row */}
              <span
                className="text-right text-[13.5px] font-semibold tabular-nums leading-none"
                style={{ color: isToday ? brand : ink }}
              >
                {d.hi != null ? `${d.hi}°` : "—"}
              </span>

              {/* Precip pill — only renders for days with ≥30% rain.
                  The slot is reserved (36px) so columns line up even
                  when the pill is absent. */}
              <span className="flex justify-end">
                {d.precip >= 30 ? (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[9.5px] font-semibold tabular-nums"
                    style={{
                      background: `color-mix(in srgb, ${cool} 16%, transparent)`,
                      color: cool,
                    }}
                  >
                    <Droplets className="h-2.5 w-2.5" strokeWidth={2.25} aria-hidden />
                    {d.precip}%
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      <p
        className="px-4 pb-2 text-[9.5px] uppercase tracking-[0.12em]"
        style={{ color: ink3 }}
      >
        National Weather Service · Frederick
      </p>
    </div>
  );
}
