"use client";

import { useState } from "react";
import {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
  ChevronDown, CalendarDays, Droplets,
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

export default function WeeklyForecast({ daily }: { daily: NwsHourly[] }) {
  const [open, setOpen] = useState(false);
  const days = groupDays(daily);
  if (days.length === 0) return null;

  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold transition active:scale-[0.99]"
        style={{ color: "var(--app-ink)" }}
      >
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
          7-day forecast
        </span>
        <ChevronDown
          className="h-4 w-4 transition-transform"
          strokeWidth={2.5}
          style={{ color: "var(--app-ink-3)", transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden
        />
      </button>

      {open && (
        <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
          {days.map((d) => {
            const k = iconForShortForecast(d.short);
            const Icon = ICONS[k];
            return (
              <li
                key={d.key}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderTop: "1px solid var(--app-border)" }}
              >
                <span className="w-10 shrink-0 text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  {d.label}
                </span>
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} style={{ color: ICON_TINT[k] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--app-ink-2)" }}>
                  {d.short}
                </span>
                {d.precip > 15 && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums" style={{ color: "var(--app-cool)" }}>
                    <Droplets className="h-3 w-3" strokeWidth={2} aria-hidden />
                    {d.precip}%
                  </span>
                )}
                <span className="w-16 shrink-0 text-right text-[13px] font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
                  {d.hi != null ? `${d.hi}°` : "–"}
                  <span style={{ color: "var(--app-ink-3)" }}> / {d.lo != null ? `${d.lo}°` : "–"}</span>
                </span>
              </li>
            );
          })}
          <li className="px-4 py-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)", borderTop: "1px solid var(--app-border)" }}>
            National Weather Service · Frederick
          </li>
        </ul>
      )}
    </div>
  );
}
