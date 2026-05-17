/**
 * NWS forecast document to a normalized tabular JSON payload.
 *
 * This is tabular, not spatial, so it is emitted as JSON rather than
 * GeoJSON. Field names are snake_case and the precipitation chance is
 * flattened from its nested object to a plain number or null.
 */

import { isoDate, type TransformResult } from "../pipeline/lib/normalize";
import type { NwsForecastRaw } from "../pipeline/schemas_ts/nws_forecast";

export function transform(raw: NwsForecastRaw): TransformResult {
  const periods = (raw.properties.periods ?? []).map((p) => ({
    number: p.number ?? null,
    name: p.name ?? "",
    start_time: isoDate(p.startTime),
    end_time: isoDate(p.endTime),
    is_daytime: p.isDaytime ?? null,
    temperature: p.temperature,
    temperature_unit: p.temperatureUnit ?? "F",
    wind_speed: p.windSpeed ?? "",
    wind_direction: p.windDirection ?? "",
    short_forecast: p.shortForecast ?? "",
    detailed_forecast: p.detailedForecast ?? "",
    precipitation_chance: p.probabilityOfPrecipitation?.value ?? null,
    icon: p.icon ?? "",
  }));

  return {
    format: "json",
    data: {
      source: "nws_forecast",
      as_of: isoDate(raw.properties.updated) ?? null,
      location: "Frederick, MD",
      periods,
    },
  };
}
