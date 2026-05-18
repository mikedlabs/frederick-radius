/**
 * Parsed Frederick County TransIT GTFS to normalized routes and stops.
 *
 * Bus routes (GTFS route_type 3) and their stops power an in-app
 * /transit surface so the app stops bouncing out to a PDF. Coordinates
 * are parsed to numbers; a stop with a missing or out-of-county
 * coordinate is dropped rather than trusted, so a bad GTFS row never
 * places a phantom stop on the map. Hex colors are normalized to a
 * leading-hash form, defaulting to null when absent.
 */

import { toNumber, inFrederickBbox, type TransformResult } from "../pipeline/lib/normalize";
import type { FcTransitGtfsRaw } from "../pipeline/schemas_ts/fc_transit_gtfs";

function hex(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toUpperCase()}` : null;
}

export function transform(raw: FcTransitGtfsRaw): TransformResult {
  const routes = (raw.routes ?? [])
    .filter((r) => String(r.route_type ?? "3") === "3") // 3 = bus
    .map((r) => ({
      id: r.route_id,
      short_name: r.route_short_name ?? null,
      long_name: r.route_long_name ?? null,
      color: hex(r.route_color),
      text_color: hex(r.route_text_color),
    }));

  const stops = (raw.stops ?? [])
    .map((s) => {
      const lat = toNumber(s.stop_lat);
      const lng = toNumber(s.stop_lon);
      return {
        id: s.stop_id,
        code: s.stop_code ?? null,
        name: s.stop_name ?? null,
        lat,
        lng,
      };
    })
    .filter(
      (s): s is typeof s & { lat: number; lng: number } =>
        s.lat !== null && s.lng !== null && inFrederickBbox(s.lat, s.lng),
    );

  return {
    format: "json",
    data: {
      source: "fc_transit_gtfs",
      route_count: routes.length,
      stop_count: stops.length,
      routes,
      stops,
    },
  };
}
