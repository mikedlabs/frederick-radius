import { getNwsForecast, type NwsHourly } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * ForecastSummary — the one-line peek that sits in the closed
 * ForecastCard trigger. Reads the same NWS forecast the hourly and
 * weekly cards read (Next.js request cache dedupes the fetch into one
 * network call), then renders a single editorial sentence that says
 * what the week looks like.
 *
 *   "7 days · 60° to 84° · 2 days of rain"
 *
 * The point is a useful peek so the reader can decide whether they
 * need to expand. On a dry stable week the summary stays short
 * ("7 days · 60° to 84°"); rain bumps the second clause in.
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

export default async function ForecastSummary() {
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
          <span style={{ color: "var(--app-cool)" }}>
            {wet} {wet === 1 ? "day" : "days"} of rain
          </span>
        </>
      )}
    </span>
  );
}
