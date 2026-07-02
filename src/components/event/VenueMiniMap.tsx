import Image from "next/image";
import Link from "next/link";
import { MAPBOX_TOKEN } from "@/lib/mapbox";

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
  const src =
    `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/` +
    `pin-s+e14328(${lng},${lat})/${lng},${lat},14.6,0/640x280@2x` +
    `?access_token=${MAPBOX_TOKEN}`;
  return (
    <Link
      href={`/map?c=${lng},${lat},15.5`}
      aria-label={`Open the map centered on ${name}`}
      className="tactile tactile-interactive block overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="relative h-[140px] w-full">
        <Image
          src={src}
          alt={`Map showing ${name}`}
          fill
          sizes="(max-width: 720px) 100vw, 720px"
          className="object-cover"
        />
      </div>
    </Link>
  );
}
