import { getNwsForecast, type NwsHourly } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * WeeklySummary — the 1-line peek that sits in the collapsed
 * WeeklyCard header. Reads the same NWS forecast WeeklyForecast
 * reads (Next.js request cache dedupes into one network call), then
 * renders a single editorial sentence the user can scan without
 * expanding the card:
 *
 *   "7 days · 60° to 84° · 2 days of rain"
 *
 * On a dry stable week the second clause drops out
 * ("7 days · 60° to 84°"). Tabular nums so the degree symbols sit
 * cleanly.
 */

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

type Day = {
  hi: number | null;
  lo: number | null;
  precip: number;
};

function groupDays(daily: NwsHourly[]): Day[] {
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
    return {
      hi: day ? day.temperature : null,
      lo: night ? night.temperature : null,
      precip: Math.max(
        day?.probabilityOfPrecipitation ?? 0,
        night?.probabilityOfPrecipitation ?? 0,
      ),
    };
  });
}

export default async function WeeklySummary() {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const daily = forecast?.daily ?? [];
  if (daily.length === 0) return null;
  const days = groupDays(daily);
  if (days.length === 0) return null;

  const allTemps = days.flatMap((d) => [d.hi, d.lo]).filter((t): t is number => t != null);
  if (allTemps.length === 0) return null;
  const min = Math.min(...allTemps);
  const max = Math.max(...allTemps);
  const wet = days.filter((d) => d.precip >= 30).length;

  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span>
        {days.length} days · {min}&deg; to {max}&deg;
      </span>
      {wet > 0 && (
        <>
          <span aria-hidden style={{ color: "var(--app-border)" }}>·</span>
          {/* Was var(--app-cool) (link-blue), the only saturated cool
              color on the screen — pulled the eye toward a secondary
              detail. Switched to ink-2 (the same warm-dark base text
              everything else on the row uses) so the rain count
              reads as part of the summary, not as an active link. */}
          <span style={{ color: "var(--app-ink-2)", fontWeight: 600 }}>
            {wet} {wet === 1 ? "day" : "days"} of rain
          </span>
        </>
      )}
    </span>
  );
}
