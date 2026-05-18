/**
 * Aviation Weather Center METAR array to one normalized observation.
 *
 * The feed returns an array; this keeps the single most recent KFDK
 * report and flattens it to snake_case JSON. Flight category is derived
 * from visibility and the lowest broken or overcast cloud base using
 * the standard FAA thresholds. Any field the sensor did not report
 * stays null. Nothing is guessed, so a quiet station never produces a
 * fabricated reading.
 */

import { isoDate, toNumber, type TransformResult } from "../pipeline/lib/normalize";
import type { KfdkMetarsRaw } from "../pipeline/schemas_ts/kfdk_metars";

type Cloud = { cover?: string | null; base?: number | null };

/** Lowest broken/overcast base in feet, or null when there is no ceiling. */
function ceilingFt(clouds: Cloud[] | null | undefined): number | null {
  if (!clouds || clouds.length === 0) return null;
  const bases = clouds
    .filter((c) => c?.cover === "BKN" || c?.cover === "OVC")
    .map((c) => toNumber(c?.base))
    .filter((b): b is number => b !== null);
  return bases.length ? Math.min(...bases) : null;
}

/** FAA flight category, or null when neither input is known (honest). */
function flightCategory(visibMi: number | null, ceiling: number | null): string | null {
  if (visibMi === null && ceiling === null) return null;
  const v = visibMi ?? Infinity;
  const c = ceiling ?? Infinity;
  if (c < 500 || v < 1) return "LIFR";
  if (c < 1000 || v < 3) return "IFR";
  if (c <= 3000 || v <= 5) return "MVFR";
  return "VFR";
}

export function transform(raw: KfdkMetarsRaw): TransformResult {
  const kfdk = raw.filter((o) => o.icaoId === "KFDK");
  const pick =
    kfdk
      .slice()
      .sort((a, b) => (toNumber(b.obsTime) ?? 0) - (toNumber(a.obsTime) ?? 0))[0] ?? null;

  if (!pick) {
    return {
      format: "json",
      data: { source: "kfdk_metars", station: "KFDK", observed: null, observation: null },
    };
  }

  const obsMs = toNumber(pick.obsTime);
  const visibMi = typeof pick.visib === "number" ? pick.visib : toNumber(pick.visib);
  const ceiling = ceilingFt(pick.clouds as Cloud[] | null | undefined);

  return {
    format: "json",
    data: {
      source: "kfdk_metars",
      station: "KFDK",
      observed: pick.reportTime ?? (obsMs !== null ? isoDate(obsMs * 1000) : null),
      observation: {
        temp_c: toNumber(pick.temp),
        dewpoint_c: toNumber(pick.dewp),
        wind_dir: pick.wdir ?? null,
        wind_kt: toNumber(pick.wspd),
        gust_kt: toNumber(pick.wgst),
        visibility_mi: visibMi,
        altimeter_hpa: toNumber(pick.altim),
        sea_level_pressure_hpa: toNumber(pick.slp),
        weather: pick.wxString ?? null,
        flight_category: flightCategory(visibMi, ceiling),
        raw: pick.rawOb ?? null,
      },
    },
  };
}
