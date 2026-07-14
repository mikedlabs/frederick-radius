import Link from "next/link";

/**
 * VenueMiniMap — a static map thumbnail of the venue on the event page.
 *
 * The page told you WHERE only in words (venue name, town, a Directions
 * link). A small static-image map (Mapbox Static Images API — one <img>,
 * zero GL cost, CDN-cached) gives the visual answer at a glance; tapping it
 * opens the live map already centered there (?c= camera param). Rendered
 * only for geo-precise events, so an area-centroid event never draws a
 * confidently wrong pin. Attribution/logo stay on (Mapbox ToS).
 */
export default function VenueMiniMap({
  geom,
  name,
}: {
  geom: { lng: number; lat: number };
  name: string;
}) {
  const lng = geom.lng.toFixed(5);
  const lat = geom.lat.toFixed(5);
  // Via /api/static-map, NOT next/image against api.mapbox.com: the
  // token is URL-restricted and the image optimizer fetches with no
  // Referer, so the direct form 403s upstream and 502s to the user
  // (which is exactly how this component shipped broken). The proxy
  // adds the Referer and caches the PNG for a month.
  const src = `/api/static-map?lng=${lng}&lat=${lat}&pin=e14328&size=640x280`;
  return (
    <Link
      href={`/map?c=${lng},${lat},15.5`}
      aria-label={`Open the map centered on ${name}`}
      className="tactile tactile-interactive block overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      {/* Plain <img>: the proxy already serves a right-sized @2x PNG. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Map showing ${name}`}
        width={1280}
        height={560}
        loading="lazy"
        decoding="async"
        className="field-map-image h-[140px] w-full object-cover"
      />
    </Link>
  );
}
