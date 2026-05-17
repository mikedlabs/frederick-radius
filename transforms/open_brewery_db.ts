/**
 * Open Brewery DB raw response to a normalized GeoJSON FeatureCollection
 * of Frederick County breweries.
 *
 * Why a municipality allow list: the source covers all of Maryland, and
 * the app must not guess a Frederick County municipality from a city
 * string it does not recognize. An unmapped city is dropped rather than
 * fabricated, which matches the project no fabrication rule.
 */

import {
  toNumber,
  inFrederickBbox,
  address,
  pointFeature,
  featureCollection,
  type TransformResult,
} from "../pipeline/lib/normalize";
import type { OpenBreweryDbRaw } from "../pipeline/schemas_ts/open_brewery_db";

const CITY_TO_MUNI: Record<string, string> = {
  frederick: "frederick",
  brunswick: "brunswick",
  thurmont: "thurmont",
  middletown: "middletown",
  "mount airy": "mount-airy",
  "mt airy": "mount-airy",
  "mt. airy": "mount-airy",
  walkersville: "walkersville",
  emmitsburg: "emmitsburg",
  "new market": "new-market",
  myersville: "myersville",
  woodsboro: "woodsboro",
  burkittsville: "burkittsville",
  jefferson: "frederick",
  ijamsville: "frederick",
  adamstown: "frederick",
  knoxville: "brunswick",
};

const EXCLUDED_TYPES = new Set(["closed", "planning", "in planning"]);

export function transform(raw: OpenBreweryDbRaw): TransformResult {
  const features = [];
  for (const r of raw) {
    const stateName = (r.state_province ?? "").trim().toLowerCase();
    if (stateName !== "maryland" && stateName !== "md") continue;
    if (EXCLUDED_TYPES.has((r.brewery_type ?? "").trim().toLowerCase())) continue;

    const cityRaw = (r.city ?? "").trim();
    const municipality = CITY_TO_MUNI[cityRaw.toLowerCase()];
    if (!municipality) continue;

    const lat = toNumber(r.latitude);
    const lng = toNumber(r.longitude);
    if (lat === null || lng === null || !inFrederickBbox(lat, lng)) continue;

    features.push(
      pointFeature(
        { lat, lng },
        {
          external_id: r.id,
          name: r.name.trim(),
          brewery_type: (r.brewery_type ?? "").trim() || "brewery",
          municipality,
          address: address({
            street: r.address_1 ?? "",
            city: cityRaw,
            state: "MD",
            zip: r.postal_code ?? "",
          }),
          phone: r.phone?.trim() || undefined,
          website: r.website_url?.trim() || undefined,
          source: "open_brewery_db",
        },
      ),
    );
  }
  return { format: "geojson", data: featureCollection(features) };
}
