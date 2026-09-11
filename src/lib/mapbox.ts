/**
 * Browser-safe Mapbox token.
 *
 * A publishable `pk.` token necessarily ships in the client bundle, but it
 * must still be a dedicated URL-restricted credential supplied at build time.
 * Never put a live fallback in source: a token in git history cannot be
 * rotated by changing Vercel and can be reused from an unrelated website.
 * Server-side APIs use mapbox-server.ts instead, so geocoding and routing can
 * be controlled independently of map rendering.
 */
export const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
