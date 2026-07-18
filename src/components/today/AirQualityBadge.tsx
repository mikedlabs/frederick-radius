import { Wind } from "lucide-react";
import { getAirQuality, isFreshAqiObservation, pickWorstAqi } from "@/lib/integrations/airnow";
import { FREDERICK_CENTER } from "@/lib/geo";
import { aqiParameterLabel } from "@/lib/air-quality";

export default async function AirQualityBadge() {
  const obs = await getAirQuality(FREDERICK_CENTER);
  if (!obs || obs.length === 0) return null;
  const worst = pickWorstAqi(obs.filter((observation) => isFreshAqiObservation(observation)));
  if (!worst) return null;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
      style={{ borderColor: "var(--app-border)" }}
      role="status"
      aria-label={`${aqiParameterLabel(worst.parameter)} ${worst.category.name}, AQI ${worst.aqi}`}
    >
      <Wind className="h-3.5 w-3.5" strokeWidth={1.75} style={{ color: worst.category.color }} aria-hidden />
      <span className="font-medium tabular-nums" style={{ color: worst.category.color }}>
        {aqiParameterLabel(worst.parameter).replace(/^./, (c) => c.toUpperCase())} AQI {worst.aqi}
      </span>
      <span style={{ color: "var(--app-ink-3)" }}>
        {worst.category.name}
      </span>
    </div>
  );
}
