import GoldenHourCard from "@/components/today/GoldenHourCard";
import { loadOutdoorSafetyHold } from "@/lib/outdoor-safety-live";
import { traceTodayRender } from "@/lib/today/render-trace";

/**
 * Golden-hour timing can remain mathematically correct while the outdoors are
 * unsafe. Keep the photography/patio prompt off Today during a severe alert or
 * fresh unhealthy AirNow reading; the safety readout at the top explains why.
 */
export default async function WeatherSafeGoldenHour({ now }: { now: Date }) {
  const hold = await traceTodayRender(
    "golden-hour",
    loadOutdoorSafetyHold(undefined, { now }),
  );
  if (hold) return null;
  return <GoldenHourCard now={now} />;
}
