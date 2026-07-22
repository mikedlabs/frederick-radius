import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
  Moon,
  CloudMoon,
  Droplets,
} from "lucide-react";
import { getNwsForecast, iconForShortForecast, type NwsHourly } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { ACCENTS } from "@/data/categories";

const ICONS = {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
  Moon, CloudMoon,
} as const;

const TINT: Record<keyof typeof ICONS, string> = {
  Sun: "#E8A33D",
  CloudSun: ACCENTS.amber,
  Cloud: "#8A8884",
  CloudRain: ACCENTS.slate,
  CloudSnow: "#7CA8D8",
  CloudLightning: "#7E2C6F",
  CloudFog: "#9A9690",
  Wind: "#4A7CA8",
  Moon: "#5C6B8A",
  CloudMoon: "#6E7894",
};

/**
 * WeeklyForecast — iOS Weather-style 7-day forecast with range bars.
 *
 * Per-day row: day · icon · Lo · range bar · Hi.
 *
 * The range bar is the key visual: each day's Lo→Hi sits as a colored
 * segment inside a track that spans the WEEK's overall Lo→Hi. A reader
 * can see at a glance which days are warmer or cooler than the rest of
 * the week without comparing numbers — the bar position carries the
 * comparison.
 *
 * On the TODAY row specifically, a small white circle marks the current
 * temperature's position within today's range — exactly like the iOS
 * Weather 10-day card. Other rows have the segment only.
 *
 * Replaces the earlier collapsed-peek / expanded-list version. The
 * iOS-style row is dense enough that a 7-day list reads cleanly on a
 * 380px screen without needing a "show / hide" toggle.
 */

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function weekdayShort(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date(iso));
}

type Day = {
  key: string;
  label: string;
  iconKey: keyof typeof ICONS;
  hi: number | null;
  lo: number | null;
  precip: number;
  isToday: boolean;
};

/** Collapse the NWS day/night periods into up to 7 calendar days. */
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
    const short = (day ?? night)?.shortForecast ?? "";
    return {
      key: k,
      label: k === todayKey ? "Today" : weekdayShort(lead.startTime),
      iconKey: iconForShortForecast(short),
      hi: day ? day.temperature : null,
      lo: night ? night.temperature : null,
      precip: Math.max(
        day?.probabilityOfPrecipitation ?? 0,
        night?.probabilityOfPrecipitation ?? 0,
      ),
      isToday: k === todayKey,
    };
  });
}

export default async function WeeklyForecast() {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const daily = forecast?.daily ?? [];
  if (daily.length === 0) return null;
  const days = groupDays(daily);
  if (days.length === 0) return null;

  // Current temp for the "you are here" indicator on the Today row.
  const currentTemp = forecast?.hourly?.[0]?.temperature ?? null;

  // Week-wide span for scaling the row bars.
  const allHi = days.map((d) => d.hi).filter((v): v is number => v != null);
  const allLo = days.map((d) => d.lo).filter((v): v is number => v != null);
  const weekMax = allHi.length ? Math.max(...allHi) : 0;
  const weekMin = allLo.length ? Math.min(...allLo) : 0;
  const weekSpan = Math.max(1, weekMax - weekMin);

  return (
    <section aria-label="7-day forecast">
      {/* Header lives on the WeeklyCard trigger — this section
          renders only the rows + footnote so it slots cleanly
          inside the disclosure wrapper without nested headers. */}

      <ul role="list" className="space-y-px">
        {days.map((d) => {
          const Icon = ICONS[d.iconKey];
          const hi = d.hi ?? d.lo ?? weekMax;
          const lo = d.lo ?? hi - 5;
          const leftPct = ((Math.min(hi, lo) - weekMin) / weekSpan) * 100;
          const widthPct = (Math.abs(hi - lo) / weekSpan) * 100;
          const nowPct =
            d.isToday && currentTemp !== null
              ? ((currentTemp - weekMin) / weekSpan) * 100
              : null;

          return (
            <li
              key={d.key}
              className="grid items-center gap-2.5 px-1 py-2.5"
              style={{
                gridTemplateColumns: "44px 22px 34px 1fr 34px 32px",
                borderTop: "1px solid var(--app-border)",
              }}
            >
              {/* Day name. "Today" gets brand color for emphasis. */}
              <span
                className="text-[13px] font-semibold tracking-tight"
                style={{
                  color: d.isToday ? "var(--app-brand)" : "var(--app-ink)",
                }}
              >
                {d.label}
              </span>

              {/* Condition glyph. */}
              <span aria-hidden className="flex justify-center">
                <Icon
                  className="h-5 w-5"
                  strokeWidth={1.75}
                  style={{ color: TINT[d.iconKey] }}
                />
              </span>

              {/* Lo temp (left of bar). */}
              <span
                className="text-right text-[13px] font-semibold tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {d.lo != null ? `${d.lo}°` : "N/A"}
              </span>

              {/* Range bar — the day's Lo→Hi sits inside the week's
                  overall track. Today's bar carries a small circle at
                  the current temp position. */}
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
                    width: `${Math.max(2, widthPct)}%`,
                    background:
                      "linear-gradient(90deg, var(--app-cool), var(--app-accent), var(--app-brand))",
                  }}
                />
                {nowPct !== null && (
                  <span
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                    style={{
                      left: `${nowPct}%`,
                      background: "var(--app-bg-elevated-solid)",
                      borderColor: "var(--app-ink)",
                    }}
                  />
                )}
              </div>

              {/* Hi temp (right of bar). */}
              <span
                className="text-right text-[13px] font-semibold tabular-nums"
                style={{ color: "var(--app-ink)" }}
              >
                {d.hi != null ? `${d.hi}°` : "N/A"}
              </span>

              {/* Optional precip chip, only when rain is ≥30% chance.
                  Quiet — sits in its own column so it doesn't shift
                  the bar widths around. */}
              <span className="flex justify-end">
                {d.precip >= 30 ? (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[11px] font-semibold tabular-nums"
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
      </ul>
      <p
        className="mt-2 px-1 pt-1 text-[11px] uppercase tracking-[0.12em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        National Weather Service · Frederick
      </p>
    </section>
  );
}
