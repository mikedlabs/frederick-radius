import Link from "next/link";

/**
 * PlaceMiniMap — the Location-section locator on a place page.
 *
 * Was a full GL map instance (a ~200KB deferred chunk, a WebGL
 * context, and a billed map LOAD per scroll-into-view, styled dark-v11
 * against the paper app). Now one static locator <img> — zero GL cost,
 * CDN-cached, on-brand light style, category-colored pin — that taps
 * through to the live map centered on the place.
 *
 * Served via /api/static-map (NOT next/image): the Mapbox token is
 * URL-restricted and the image optimizer fetches with no Referer, so
 * a direct next/image of api.mapbox.com 502s. The proxy adds the
 * Referer and caches the PNG for a month. Attribution/logo stay baked
 * into the image (Mapbox ToS).
 */
export default function PlaceMiniMap({
  lng,
  lat,
  name,
  color,
}: {
  lng: number;
  lat: number;
  /** For the alt text + tap-through label. */
  name: string;
  /** Category hex like "#B5462B"; non-hex values fall back to brand. */
  color?: string;
}) {
  const pin =
    color && /^#[0-9a-fA-F]{6}$/.test(color)
      ? color.slice(1).toLowerCase()
      : "e14328";
  // The image proxy resolves coordinates to four decimals (~11m). Match its
  // public URL precision so nearly identical pins share one edge-cache key;
  // the interactive-map handoff keeps the more precise five-decimal camera.
  const src = `/api/static-map?lng=${lng.toFixed(4)}&lat=${lat.toFixed(4)}&pin=${pin}&size=320x150`;
  return (
    <Link
      href={`/map?c=${lng.toFixed(5)},${lat.toFixed(5)},15.5`}
      prefetch={false}
      aria-label={`Open the map centered on ${name}`}
      className="tactile tactile-interactive block overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      {/* Plain <img>: the proxy already serves a right-sized @2x PNG;
          a second pass through the image optimizer would just re-encode
          it (and can't cache better than the route's s-maxage). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Map showing ${name}`}
        width={640}
        height={300}
        loading="lazy"
        decoding="async"
        className="field-map-image h-44 w-full object-cover"
      />
    </Link>
  );
}
