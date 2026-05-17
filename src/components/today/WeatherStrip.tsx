import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind, ArrowUp, ArrowDown, Sunrise, Sunset, Sparkles } from "lucide-react";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes, nextSunHint } from "@/lib/sun";
import WeeklyForecast from "./WeeklyForecast";

function fmtClock(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(d)
    .replace(" ", "")
    .toLowerCase();
}

const ICONS = {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
} as const;

// Per-condition icon tint so the strip isn't all one brand color.
const ICON_TINT: Record<keyof typeof ICONS, string> = {
  Sun: "#E8A33D",
  CloudSun: "#D9A441",
  Cloud: "#8A8884",
  CloudRain: "#2A5D8F",
  CloudSnow: "#7CA8D8",
  CloudLightning: "#7E2C6F",
  CloudFog: "#9A9690",
  Wind: "#4A7CA8",
};

function formatHour(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  }).format(d).toLowerCase().replace(" ", "");
}

function nyHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()),
    10
  );
}

/** Gradient + text tone for the card backdrop, driven by condition + time of day. */
function backdrop(shortForecast: string): { gradient: string; tone: "light" | "dark" } {
  const s = shortForecast.toLowerCase();
  const h = nyHour();
  const night = h < 6 || h >= 20;

  if (/thunder|storm/.test(s)) return { gradient: "linear-gradient(135deg,#3D3460,#5B1E55)", tone: "dark" };
  if (/snow|sleet|ice|flurr/.test(s)) return { gradient: "linear-gradient(135deg,#AEC8DE,#D6E2E6)", tone: "light" };
  if (/rain|shower|drizzle/.test(s)) return { gradient: "linear-gradient(135deg,#4A6C82,#7CA0B5)", tone: "dark" };
  if (/fog|haze|mist/.test(s)) return { gradient: "linear-gradient(135deg,#A8A39A,#C9C4BB)", tone: "light" };
  if (night) return { gradient: "linear-gradient(135deg,#1F2444,#3A3458)", tone: "dark" };
  if (/cloud|overcast/.test(s)) return { gradient: "linear-gradient(135deg,#9FB4C4,#C7D4DD)", tone: "light" };
  // sunny / clear daytime
  return { gradient: "linear-gradient(135deg,#7CB9E8,#E8C99A)", tone: "light" };
}

export default async function WeatherStrip() {
  const forecast = await getNwsForecast(FREDERICK_CENTER);

  if (!forecast || forecast.hourly.length === 0) {
    return (
      <div
        className="rounded-[var(--app-radius-lg)] border border-dashed px-3 py-4 text-center text-xs"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        Weather temporarily unavailable
      </div>
    );
  }

  const hours = forecast.hourly.slice(0, 8);
  const next24 = forecast.hourly.slice(0, 24);
  const hi = Math.max(...next24.map((h) => h.temperature));
  const lo = Math.min(...next24.map((h) => h.temperature));
  const cur = forecast.hourly[0];
  const CurIcon = ICONS[iconForShortForecast(cur.shortForecast)];
  const { gradient, tone } = backdrop(cur.shortForecast);
  const ink = tone === "dark" ? "#FFFFFF" : "#1A1A1A";
  const ink2 = tone === "dark" ? "rgba(255,255,255,0.78)" : "rgba(26,26,26,0.62)";
  const ink3 = tone === "dark" ? "rgba(255,255,255,0.55)" : "rgba(26,26,26,0.42)";
  const sunPanel = tone === "dark" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.45)";
  const maxPrecip = Math.max(10, ...next24.map((h) => h.probabilityOfPrecipitation ?? 0));

  // Pure, computed (no API): sun + the golden-hour window, the light a
  // place-discovery app actually cares about.
  const now = new Date();
  const sun = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  const sunHint = nextSunHint(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);

  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)", background: gradient }}
    >
      {/* Hero "now" block */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="flex items-center gap-3">
          <CurIcon className="h-11 w-11 shrink-0" strokeWidth={1.5} style={{ color: ink }} aria-hidden />
          <div>
            <p className="font-serif text-[30px] font-semibold leading-none tabular-nums" style={{ color: ink }}>
              {cur.temperature}°
            </p>
            <p className="mt-0.5 text-[12px] font-medium" style={{ color: ink2 }}>
              {cur.shortForecast}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-[13px] font-semibold tabular-nums" style={{ color: ink }}>
            <ArrowUp className="h-3 w-3" strokeWidth={2.5} aria-hidden /> {hi}°
            <ArrowDown className="ml-1.5 h-3 w-3" strokeWidth={2.5} aria-hidden /> {lo}°
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px]" style={{ color: ink2 }}>
            <Wind className="h-3 w-3" strokeWidth={2} aria-hidden /> {cur.windSpeed}
          </p>
        </div>
      </div>

      {/* Hourly strip on a frosted panel for legibility over the gradient */}
      <div
        className="mt-3 overflow-x-auto px-3 py-3 scrollbar-hide"
        style={{ background: tone === "dark" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.45)", backdropFilter: "blur(2px)" }}
      >
        <div className="mb-1.5 flex items-center justify-between px-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: ink2 }}>
            Next 8 hours
          </p>
          <p className="text-[9px] uppercase tracking-[0.1em]" style={{ color: ink2 }}>
            National Weather Service
          </p>
        </div>
        <ul className="flex min-w-max items-end gap-4">
          {hours.map((h, idx) => {
            const k = iconForShortForecast(h.shortForecast);
            const Icon = ICONS[k];
            const precip = h.probabilityOfPrecipitation ?? 0;
            return (
              <li key={h.startTime} className="flex w-9 flex-col items-center gap-1">
                <span className="text-[10px] font-semibold uppercase" style={{ color: ink2 }}>
                  {idx === 0 ? "Now" : formatHour(h.startTime)}
                </span>
                <Icon className="h-5 w-5" strokeWidth={1.75} style={{ color: tone === "dark" ? "#fff" : ICON_TINT[k] }} aria-hidden />
                <span className="text-[13px] font-bold tabular-nums" style={{ color: ink }}>
                  {h.temperature}°
                </span>
                {/* Precip mini-bar */}
                <div className="h-6 w-1.5 overflow-hidden rounded-full" style={{ background: tone === "dark" ? "rgba(255,255,255,0.18)" : "rgba(42,93,143,0.15)" }}>
                  <div
                    className="w-full rounded-full"
                    style={{
                      height: `${Math.round((precip / maxPrecip) * 100)}%`,
                      marginTop: `${100 - Math.round((precip / maxPrecip) * 100)}%`,
                      background: "var(--app-cool)",
                    }}
                  />
                </div>
                <span className="text-[9px] font-medium tabular-nums" style={{ color: precip > 15 ? "var(--app-cool)" : "transparent" }}>
                  {precip}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Sun + golden hour — a frosted line of THIS card. The good
          light is named only when it's actually upcoming/now. */}
      {(sun.sunrise || sun.sunset) && (
        <div
          className="flex items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px]"
          style={{ background: sunPanel, backdropFilter: "blur(2px)", borderTop: `1px solid ${tone === "dark" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)"}` }}
        >
          {sunHint && sunHint.to && (
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: ink }}>
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden style={{ color: tone === "dark" ? "#E8C99A" : "#B07A1E" }} />
              {sunHint.label}
              <span className="font-medium tabular-nums" style={{ color: ink2 }}>
                {fmtClock(sunHint.from)}–{fmtClock(sunHint.to)}
              </span>
            </span>
          )}
          {sun.sunrise && (
            <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: ink2 }}>
              <Sunrise className="h-3.5 w-3.5" strokeWidth={2} aria-hidden style={{ color: ink3 }} />
              {fmtClock(sun.sunrise)}
            </span>
          )}
          {sun.sunset && (
            <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: ink2 }}>
              <Sunset className="h-3.5 w-3.5" strokeWidth={2} aria-hidden style={{ color: ink3 }} />
              {fmtClock(sun.sunset)}
            </span>
          )}
        </div>
      )}

      {/* 7-day outlook — a frosted sub-panel of THIS card, not a
          detached afterthought. One cohesive weather module. */}
      <WeeklyForecast daily={forecast.daily} tone={tone} />
    </div>
  );
}
