import "server-only";

import { MAPBOX_TOKEN } from "@/lib/mapbox";

/**
 * Token used only by server-side Mapbox requests.
 *
 * MAPBOX_SERVER_TOKEN should be a dedicated, least-privilege token. The public
 * fallback preserves Static Images, Directions, and Isochrone while production
 * is migrated; it can be removed after the dedicated token is verified.
 */
export const MAPBOX_SERVER_TOKEN =
  process.env.MAPBOX_SERVER_TOKEN?.trim() || MAPBOX_TOKEN;

/**
 * Forward geocoding is deliberately opt-in. It is enrichment, not a critical
 * request-path dependency, and keeping the switch fail-closed gives production
 * an immediate circuit breaker for cost anomalies.
 *
 * Required browser checks run against deterministic local fixtures. They must
 * not fan out dozens of paid third-party geocodes during a cold event assembly;
 * the geocoder has its own contract tests, while the browser gate verifies that
 * core surfaces remain usable when dependencies fail.
 */
export const MAPBOX_GEOCODING_ENABLED =
  process.env.MAPBOX_GEOCODING_ENABLED === "1" &&
  process.env.CI !== "true";

/**
 * A restricted publishable fallback requires an allowed Referer even when the
 * request originates on the server. A dedicated server token may ignore this
 * header; sending it remains harmless and keeps the fallback operational.
 */
export const MAPBOX_SERVER_HEADERS = {
  Referer: "https://frederickradius.app/",
} as const;
