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
  "pk.eyJ1IjoibWlrZS0tZCIsImEiOiJjbWc4ajU5MTEwN3l1MmlwcmJvZ2VjejV6In0.ma_LGFI0RCGfj42DnNUCcA";
