import GoldenHourCard from "@/components/today/GoldenHourCard";
import { loadOutdoorSafetyHold } from "@/lib/outdoor-safety-live";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getNwsForecast } from "@/lib/integrations/nws";
import { leanFromForecast } from "@/lib/today/weatherLean";

/**
 * Golden-hour timing can remain mathematically correct while the outdoors are
 * unsafe. Keep the photography/patio prompt off Today during a severe alert or
 * fresh unhealthy AirNow reading; the safety readout at the top explains why.
 */
export default async function WeatherSafeGoldenHour({ now }: { now: Date }) {
  const [hold, forecast] = await Promise.all([
    loadOutdoorSafetyHold(undefined, { now, deadlineMs: 500 }),
    Promise.race([
      getNwsForecast(FREDERICK_CENTER).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ]),
  ]);
  if (hold || leanFromForecast(forecast, now) === "wet") return null;
  return <GoldenHourCard now={now} />;
}
