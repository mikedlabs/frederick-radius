/**
 * Mapbox public token, resolved once.
 *
 * DELIBERATELY IGNORES NEXT_PUBLIC_MAPBOX_TOKEN for now (2026-07-20).
 * The Vercel env var holds a DEAD token (verified live: 401 "Not
 * Authorized - Invalid Token"), and because the old precedence read the
 * env var first, it silently overrode the valid committed token below
 * and kept the whole map blank through TWO code-side rotations. Until
 * the owner deletes or updates that env var in Vercel (Settings →
 * Environment Variables → NEXT_PUBLIC_MAPBOX_TOKEN), the committed
 * token below is the single source of truth. Once the env var carries
 * a validated token again, restore the `process.env... ||` precedence.
 *
 * This token is validated live (200 on api.mapbox.com with the prod
 * Referer, with localhost, and with none). A Mapbox "pk." token is
 * publishable by design - it ships in the client bundle wherever the
 * map renders - so this is not a secret leak.
 */
export const MAPBOX_TOKEN =
  "pk.eyJ1IjoibWlrZS0tZCIsImEiOiJjbXJ0OHMxOXMwMGh2MnlvdTU3aDF0YmNjIn0.y3TJYII52CH6MbRVQs9-IQ";

/**
 * Required on EVERY server-side fetch to api.mapbox.com.
 *
 * The production token is URL-restricted to frederickradius.app, and
 * Mapbox enforces that restriction by matching the HTTP Referer header
 * on ALL its APIs (verified live 2026-07-07: Static Images and
 * Isochrone both 403 with no Referer, 200 with this one). A browser
 * sends the Referer automatically; a server fetch sends none, so a
 * proxy route that forgets these headers silently loses its upstream
 * (the isochrone proxy shipped that way — every guided-mode radius
 * quietly fell back to a circle).
 */
export const MAPBOX_SERVER_HEADERS = {
  Referer: "https://frederickradius.app/",
} as const;
