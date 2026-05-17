"use client";

import { useState } from "react";
import {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
  ChevronDown, Droplets,
} from "lucide-react";
import { iconForShortForecast, type NwsHourly } from "@/lib/integrations/nws";

const ICONS = { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind } as const;
const ICON_TINT: Record<keyof typeof ICONS, string> = {
  Sun: "#E8A33D", CloudSun: "#D9A441", Cloud: "#8A8884", CloudRain: "#2A5D8F",
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
 * card (NOT a detached card). `tone` is the parent card's light/dark
 * tone so the type sits legibly on the same gradient as the hourly
 * strip — one cohesive weather module, not an afterthought. Collapsed
 * by default it shows a four-day glance; tap to expand the full week.
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
  const cool = tone === "dark" ? "#9CC4E8" : "#2A5D8F";

  return (
    <div
      className="mt-px"
      style={{ background: panel, backdropFilter: "blur(2px)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-[12px] font-semibold transition active:scale-[0.99]"
        style={{ color: ink }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: ink2 }}>
            7-day
          </span>
          {!open && (
            <span className="flex min-w-0 items-center gap-2.5 overflow-hidden" style={{ color: ink3 }}>
              {days.slice(1, 5).map((d) => {
                const k = iconForShortForecast(d.short);
                const Icon = ICONS[k];
                return (
                  <span key={d.key} className="inline-flex shrink-0 items-center gap-1">
                    <span className="text-[10px] font-medium">{d.label}</span>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    <span className="text-[10px] font-semibold tabular-nums" style={{ color: ink2 }}>
                      {d.hi != null ? `${d.hi}°` : "–"}
                    </span>
                  </span>
                );
              })}
            </span>
          )}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 transition-transform"
          strokeWidth={2.5}
          style={{ color: ink3, transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden
        />
      </button>

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
