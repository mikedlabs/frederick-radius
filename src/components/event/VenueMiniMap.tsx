import Link from "next/link";
import OwnedMiniMap from "@/components/map/OwnedMiniMap";
import StaticMapPreview from "@/components/map/StaticMapPreview";
import { MINI_MAP_ZOOM, miniMapSource } from "@/components/map/miniMapSource";
import { BRAND } from "@/lib/brand";

// The static-map proxy allowlists category colors, and Brick is one of them.
const STATIC_PIN = BRAND.colors.brick.slice(1).toLowerCase();

/**
 * VenueMiniMap — a map of the venue's block on the event page.
 *
 * The page told you WHERE only in words (venue name, town, a Directions
 * link). The default answer is a still map from the self-hosted county
 * basemap (OwnedMiniMap), which costs nothing per load and mounts MapLibre
 * only when it nears the viewport. When Static Images is deliberately
 * enabled, a compact paid image gives the same answer instead, and the
 * default configuration never issues that request. Rendered only for
 * geo-precise events, so an area-centroid event never draws a confidently
 * wrong pin. Attribution stays visible in both (Mapbox's on its image, the
 * OpenStreetMap credit on the basemap).
 */
export default function VenueMiniMap({
  geom,
  name,
  address,
}: {
  geom: { lng: number; lat: number };
  name: string;
  /** Street address for the placeholder shown before the map draws. */
  address?: string | null;
}) {
  const lng = geom.lng.toFixed(5);
  const lat = geom.lat.toFixed(5);
  // Via /api/static-map, NOT next/image against api.mapbox.com: the
  // token is URL-restricted and the image optimizer fetches with no
  // Referer, so the direct form 403s upstream and 502s to the user
  // (which is exactly how this component shipped broken). The proxy
  // adds the Referer and caches the PNG for a month.
  const src = `/api/static-map?lng=${lng}&lat=${lat}&pin=${STATIC_PIN}&size=640x280`;
  return (
    <Link
      href={`/map?c=${lng},${lat},${MINI_MAP_ZOOM}`}
      aria-label={`Open the map centered on ${name}`}
      className="tactile tactile-interactive block overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      {miniMapSource() === "static-image" ? (
        <StaticMapPreview
          src={src}
          alt={`Map showing ${name}`}
          width={1280}
          height={560}
          className="h-[140px] w-full"
        />
      ) : (
        <OwnedMiniMap lng={geom.lng} lat={geom.lat} zoom={MINI_MAP_ZOOM} name={name} address={address} />
      )}
    </Link>
  );
}
