"use client";

import { useEffect, useState } from "react";
import {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
  Droplets, ChevronDown,
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

const STORAGE_KEY = "fr:wx-week-expanded:v1";

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
 * 7-day forecast — collapsed by default, expandable on tap.
 *
 * Per direct feedback: the previous always-visible 7-row layout was
 * "way too much" and "needs a button to hide the seven-day." This
 * version shows a one-line peek summary by default and expands on
 * tap. The user's open/closed preference persists in localStorage
 * so the next visit honors it.
 *
 * Peek line (collapsed):
 *   [7-day]  Today 77° · Wed 80° · ··· · Mon 75°  [▾]
 *
 * Expanded: the same 7 readable rows from the prior redesign, with
 * weekday + glyph + hi-lo gradient bar + hi temp + precip pill.
 *
 * Interaction:
 *   - Tap header → toggle
 *   - Keyboard: Enter / Space on focused header
 *   - prefers-reduced-motion: respected via CSS transition fallback
 */
export default function WeeklyForecast({
  daily,
  tone,
}: {
  daily: NwsHourly[];
  tone: "light" | "dark";
}) {
  // Default collapsed. Hydrate the persisted preference on mount so
  // SSR + first paint always show the calm one-line peek. If the user
  // previously expanded it, the client effect flips it open after
  // mount — a brief peek-flash but no hydration mismatch.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setOpen(true);
    } catch {
      // localStorage blocked (Safari private mode, etc.) — stay closed.
    }
  }, []);
  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  }

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

  const allHi = days.map((d) => d.hi).filter((v): v is number => v != null);
  const allLo = days.map((d) => d.lo).filter((v): v is number => v != null);
  const weekMax = allHi.length ? Math.max(...allHi) : 0;
  const weekMin = allLo.length ? Math.min(...allLo) : 0;
  const weekSpan = Math.max(1, weekMax - weekMin);

  // Peek summary — three temperature snapshots so the collapsed row
  // still says something useful: today's hi, the week's hi, the
  // week's lo (with their day labels).
  const todayHi = days[0]?.hi;
  const hottestDay = days.reduce<Day | null>(
    (best, d) => (d.hi != null && (!best || (best.hi ?? -Infinity) < d.hi)) ? d : best,
    null,
  );
  const coldestDay = days.reduce<Day | null>(
    (best, d) => (d.lo != null && (!best || (best.lo ?? Infinity) > d.lo)) ? d : best,
    null,
  );

  return (
    <div
      className="mt-px"
      style={{ background: panel, backdropFilter: "blur(2px)" }}
    >
      {/* Header — always visible, doubles as the toggle. The
          chevron rotates to signal state. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="weekly-forecast-rows"
        className="block w-full text-left transition active:scale-[0.998]"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="flex items-baseline gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: ink2 }}
            >
              7-day
            </span>
            {!open && (
              <span
                className="text-[11.5px] tabular-nums"
                style={{ color: ink3 }}
              >
                {todayHi != null && (
                  <>
                    <span style={{ color: ink }}>Today {todayHi}°</span>
                  </>
                )}
                {hottestDay && hottestDay.label !== "Today" && hottestDay.hi != null && (
                  <>
                    {" · "}
                    {hottestDay.label} <span style={{ color: brand }}>{hottestDay.hi}°</span>
                  </>
                )}
                {coldestDay && coldestDay.label !== "Today" && coldestDay !== hottestDay && coldestDay.lo != null && (
                  <>
                    {" · "}
                    {coldestDay.label} <span style={{ color: cool }}>{coldestDay.lo}°</span>
                  </>
                )}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] tabular-nums" style={{ color: ink3 }}>
            {open && <span>{weekMin}° – {weekMax}°</span>}
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform"
              strokeWidth={2.5}
              style={{ color: ink3, transform: open ? "rotate(180deg)" : "none" }}
              aria-hidden
            />
          </span>
        </div>
      </button>

      {open && (
        <ul id="weekly-forecast-rows" className="px-2 pb-2">
          {days.map((d) => {
            const isToday = d.label === "Today";
            const k = iconForShortForecast(d.short);
            const Icon = ICONS[k];
            const iconColor = tone === "dark" ? "#fff" : tints[k];

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
                <span
                  className="text-[12.5px] font-semibold tracking-tight"
                  style={{ color: isToday ? brand : ink }}
                >
                  {d.label}
                </span>

                <span aria-hidden className="flex justify-center">
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={1.75}
                    style={{ color: iconColor }}
                  />
                </span>

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

                <span
                  className="text-right text-[13.5px] font-semibold tabular-nums leading-none"
                  style={{ color: isToday ? brand : ink }}
                >
                  {d.hi != null ? `${d.hi}°` : "—"}
                </span>

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
          <li
            className="px-2.5 pt-2 text-[9.5px] uppercase tracking-[0.12em]"
            style={{ color: ink3 }}
          >
            National Weather Service · Frederick
          </li>
        </ul>
      )}
    </div>
  );
}
