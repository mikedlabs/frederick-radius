import Link from "next/link";
import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind, AlertTriangle } from "lucide-react";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { getNwsAlerts } from "@/lib/integrations/nws-alerts";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * The single weather row at the very top of the home. Deliberately not
 * the full weather module: current temp + condition, the next three
 * hour ticks, and an active NWS alert badge linking to /pulse. No
 * 7-day, no hourly grid, no expanded view. The rich card lives at
 * /pulse. Built from existing tokens and the shared NWS integration so
 * it is not a new component family, just a smaller composition.
 */
const ICONS = { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind } as const;

function hourLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" })
    .format(new Date(iso))
    .toLowerCase()
    .replace(" ", "");
}

export default async function HomeWeatherStrip() {
  const [forecast, alerts] = await Promise.all([
    getNwsForecast(FREDERICK_CENTER).catch(() => null),
    getNwsAlerts().catch(() => []),
  ]);

  const cur = forecast?.hourly?.[0] ?? null;
  const next3 = forecast?.hourly?.slice(1, 4) ?? [];
  const CurIcon = cur ? ICONS[iconForShortForecast(cur.shortForecast)] : Cloud;

  return (
    <div className="space-y-1.5">
      <div
        className="tactile flex items-center gap-3 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] px-4 py-3"
        aria-label="Current weather"
      >
        {cur ? (
          <>
            <CurIcon className="h-7 w-7 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-cool)" }} aria-hidden />
            <div className="min-w-0">
              <p className="text-[18px] font-semibold leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>
                {cur.temperature}&deg;
              </p>
              <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                {cur.shortForecast}
              </p>
            </div>
            <ul className="ml-auto flex items-center gap-3">
              {next3.map((h) => {
                const Hi = ICONS[iconForShortForecast(h.shortForecast)];
                return (
                  <li key={h.startTime} className="flex w-9 flex-col items-center gap-0.5">
                    <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--app-ink-3)" }}>
                      {hourLabel(h.startTime)}
                    </span>
                    <Hi className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-ink-2)" }} aria-hidden />
                    <span className="text-[12px] font-bold tabular-nums" style={{ color: "var(--app-ink)" }}>
                      {h.temperature}&deg;
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Weather is briefly unavailable.
          </p>
        )}
      </div>

      {alerts.length > 0 && (
        <Link
          href="/pulse"
          className="tactile tactile-interactive flex items-center gap-2 rounded-[var(--app-radius-md)] px-3 py-2 text-[12px] font-semibold"
          style={{ background: "var(--app-warning)", color: "#fff" }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
          <span className="truncate">
            {alerts.length === 1 ? "1 active weather alert" : `${alerts.length} active weather alerts`}
          </span>
          <span className="ml-auto shrink-0 opacity-90">View</span>
        </Link>
      )}
    </div>
  );
}
