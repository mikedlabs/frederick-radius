/**
 * Browser-safe Mapbox token.
 *
 * A publishable `pk.` token necessarily ships in the client bundle. The
 * bundled fallback keeps the map alive while the previously stale Vercel
 * value is replaced; once the validated environment value is present it wins
 * without another code change. Server-side APIs use mapbox-server.ts instead,
 * so geocoding and routing can be controlled independently of map rendering.
 */
const MAPBOX_BUNDLED_FALLBACK =
  "pk.eyJ1IjoibWlrZS0tZCIsImEiOiJjbXJ0OHMxOXMwMGh2MnlvdTU3aDF0YmNjIn0.y3TJYII52CH6MbRVQs9-IQ";

export const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || MAPBOX_BUNDLED_FALLBACK;
