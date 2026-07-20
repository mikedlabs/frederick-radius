/**
 * Mapbox public token, resolved once.
 *
 * NEXT_PUBLIC_MAPBOX_TOKEN takes precedence, so setting it in Vercel
 * cleanly supersedes this committed fallback with no conflict or
 * rotation issue. The fallback exists only because the env var was not
 * set in Vercel production, which left the entire map blank. A Mapbox
 * "pk." token is publishable by design (it ships in the client bundle
 * wherever the map renders), so this is not a secret leak; still,
 * moving it to Vercel env and rotating it when convenient is cleaner.
 */
export const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  // Rotated 2026-07-20: the prior committed token started returning
  // "401 Not Authorized - Invalid Token" and took the entire map down on
  // prod (owner report: "the map wont load"). This replacement is
  // validated live (200 on api.mapbox.com with and without the prod
  // Referer). Publishable `pk.` token by design; set NEXT_PUBLIC_MAPBOX_TOKEN
  // in Vercel to supersede this, and consider a frederickradius.app URL
  // restriction on the Mapbox side to limit abuse.
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
