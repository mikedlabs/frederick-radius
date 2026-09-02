import "server-only";

/**
 * Token used only by server-side Mapbox requests.
 *
 * MAPBOX_SERVER_TOKEN must be a dedicated, least-privilege access token kept
 * only in the server environment. The current APIs require no secret account
 * scopes, so this may be a separate public-scope `pk.` token. It never falls
 * back to the token bundled in client JavaScript.
 */
export const MAPBOX_SERVER_TOKEN =
  process.env.MAPBOX_SERVER_TOKEN?.trim() ?? "";

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
 * Sending the production Referer remains harmless for a dedicated token and
 * preserves compatibility with a server token that also carries a URL rule.
 */
export const MAPBOX_SERVER_HEADERS = {
  Referer: "https://frederickradius.app/",
} as const;
