import type { NwsHourly } from "@/lib/integrations/nws";
import { easternDayKey } from "@/lib/tz";

type Temperature = Pick<NwsHourly, "temperature" | "temperatureUnit">;
type DailyPeriod = Temperature & Pick<NwsHourly, "startTime" | "endTime" | "isDaytime">;

export function forecastTemperatureF(period: Temperature | null): number | null {
  if (!period || !Number.isFinite(period.temperature)) return null;
  if (period.temperatureUnit === "F") return Math.round(period.temperature);
  if (period.temperatureUnit === "C") return Math.round(period.temperature * 9 / 5 + 32);
  return null;
}

/** Pair the local day's NWS daytime high with that evening's overnight low.
 * A shortened pre-dawn period belongs to last night. After sunset NWS may
 * have dropped today's high altogether; tomorrow's high belongs to tomorrow. */
export function todayForecastRange(periods: DailyPeriod[], now: Date) {
  const today = easternDayKey(now);
  let highF: number | null = null;
  let lowF: number | null = null;
  for (const period of periods) {
    const start = new Date(period.startTime);
    const end = new Date(period.endTime);
    if (!(end > start) || easternDayKey(start) !== today) continue;
    if (period.isDaytime === true) highF ??= forecastTemperatureF(period);
    if (period.isDaytime === false && easternDayKey(end) !== today) {
      lowF ??= forecastTemperatureF(period);
    }
  }
  return { highF, lowF };
}
