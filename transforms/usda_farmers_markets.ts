/**
 * USDA Local Food Portal markets to normalized, county-scoped JSON.
 *
 * USDA returns the whole nation for a query, so each market is checked
 * against the Frederick County bounding box and anything outside it,
 * or missing coordinates, is dropped. A market is never relocated or
 * its coordinates guessed. Coordinates follow USDA convention:
 * location_x is longitude, location_y is latitude. The output slots
 * into the existing nearbyNow().feeds.farmersMarkets seam in
 * src/lib/connect.ts when the row is activated.
 */

import { toNumber, isoDate, inFrederickBbox, type TransformResult } from "../pipeline/lib/normalize";
import type { UsdaFarmersMarketsRaw } from "../pipeline/schemas_ts/usda_farmers_markets";

export function transform(raw: UsdaFarmersMarketsRaw): TransformResult {
  const markets = (raw.data ?? [])
    .map((m) => {
      const lat = toNumber(m.location_y);
      const lng = toNumber(m.location_x);
      return {
        id: String(m.listing_id),
        name: (m.listing_name ?? "").trim() || null,
        address: m.location_address ?? null,
        lat,
        lng,
        description: m.listing_desc ?? null,
        website: m.media_website ?? null,
        phone: m.contact_phone ?? null,
        updated: isoDate(m.updatetime) ?? null,
      };
    })
    .filter(
      (m): m is typeof m & { lat: number; lng: number } =>
        m.lat !== null && m.lng !== null && inFrederickBbox(m.lat, m.lng),
    );

  return {
    format: "json",
    data: {
      source: "usda_farmers_markets",
      market_count: markets.length,
      markets,
    },
  };
}
