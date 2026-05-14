import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind } from "lucide-react";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

const ICONS = {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
} as const;

function formatHour(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  }).format(d).toLowerCase().replace(" ", "");
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

  return (
    <div
      className="overflow-x-auto rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] px-3 py-3 shadow-[var(--app-shadow-1)] scrollbar-hide"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Hourly · National Weather Service
        </p>
        <p className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>
          {forecast.hourly[0]?.shortForecast}
        </p>
      </div>
      <ul className="flex min-w-max items-end gap-5">
        {hours.map((h, idx) => {
          const Icon = ICONS[iconForShortForecast(h.shortForecast)];
          return (
            <li key={h.startTime} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
                {idx === 0 ? "now" : formatHour(h.startTime)}
              </span>
              <Icon className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
              <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
                {h.temperature}°
              </span>
              {h.probabilityOfPrecipitation && h.probabilityOfPrecipitation > 20 ? (
                <span className="text-[10px] font-medium" style={{ color: "var(--app-info)" }}>
                  {h.probabilityOfPrecipitation}%
                </span>
              ) : (
                <span className="text-[10px]" style={{ color: "transparent" }}>·</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
