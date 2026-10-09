import Link from "next/link";
import OwnedMiniMap from "@/components/map/OwnedMiniMap";
import StaticMapPreview from "@/components/map/StaticMapPreview";
import { MINI_MAP_ZOOM, miniMapSource } from "@/components/map/miniMapSource";
import { BRAND } from "@/lib/brand";

/**
 * PlaceMiniMap — the Location-section locator on a place page.
 *
 * The default is a still map of the block from the self-hosted county
 * basemap (OwnedMiniMap). It costs nothing per load and mounts MapLibre only
 * when the section nears the viewport, so a visitor who never scrolls this
 * far pays nothing for it. The decorative coordinate grid it replaces showed
 * a dot and raw coordinates instead of the street the place is on.
 *
 * When Static Images is deliberately enabled, it upgrades to one CDN-cached
 * image served via /api/static-map (not next/image), which requires its
 * switch, a nonzero budget, and a dedicated server token. With the
 * default-off configuration, the rendered markup contains no image URL and
 * therefore cannot make even a failed request to the paid proxy. Both states
 * tap through to the live Radius map.
 */
export default function PlaceMiniMap({
  lng,
  lat,
  name,
  address,
  color,
}: {
  lng: number;
  lat: number;
  /** For the accessible name, caption, and tap-through label. */
  name: string;
  /** Street address for the placeholder shown before the map draws. */
  address?: string | null;
  /** Category hex like "#B5462B" for the static image pin; non-hex values fall back to Brick. */
  color?: string;
}) {
  const markerColor =
    color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : BRAND.colors.brick;
  const pin = markerColor.slice(1).toLowerCase();
  // The image proxy resolves coordinates to four decimals (~11m). Match its
  // public URL precision so nearly identical pins share one edge-cache key;
  // the interactive-map handoff keeps the more precise five-decimal camera.
  const src = `/api/static-map?lng=${lng.toFixed(4)}&lat=${lat.toFixed(4)}&pin=${pin}&size=320x150`;
  return (
    <Link
      href={`/map?c=${lng.toFixed(5)},${lat.toFixed(5)},${MINI_MAP_ZOOM}`}
      prefetch={false}
      aria-label={`Open the map centered on ${name}`}
      className="tactile tactile-interactive block overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      {miniMapSource() === "static-image" ? (
        <StaticMapPreview
          src={src}
          alt={`Map showing ${name}`}
          width={640}
          height={300}
          className="h-44 w-full"
        />
      ) : (
        <OwnedMiniMap lng={lng} lat={lat} zoom={MINI_MAP_ZOOM} name={name} address={address} />
      )}
    </Link>
  );
}
