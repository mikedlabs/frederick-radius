import Link from "next/link";
import { getLandmarkPhoto, wikimediaUrl, type WikimediaPhoto } from "@/lib/integrations/wikimedia";
import PlaceHeroMedia, { type PlaceHeroPhoto } from "@/components/place/PlaceHeroMedia";
import { GooglePhotoAttributionLine } from "@/components/place/GoogleAttribution";
import OwnedMiniMap from "@/components/map/OwnedMiniMap";
import StaticMapPreview from "@/components/map/StaticMapPreview";
import { MINI_MAP_ZOOM, miniMapSource } from "@/components/map/miniMapSource";
import { BRAND } from "@/lib/brand";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import type { PlaceHeroMap as PlaceHeroMapPlan } from "@/lib/place-page";

type Props = {
  slug: string;
  name: string;
  aspectRatio?: "16/10" | "16/9" | "4/3" | "1/1";
  size?: "card" | "hero";
  priority?: boolean;
  /** Real Google photo (proxied, key-safe). */
  photoSrc?: string;
  photoAttribution?: GooglePhotoAttribution;
  googleMapsUri?: string;
  /** The place's own block, drawn when no photo loads (see placeHeroMap). */
  map?: PlaceHeroMapPlan | null;
  /** Street address for the map's placeholder before MapLibre draws. */
  address?: string | null;
};

/**
 * The place page hero follows the honest image ladder in docs/VISUAL_FIRST.md:
 *
 * 1. A photograph that actually loads: the Google photo of the business and a
 *    verified Wikimedia landmark photo, tried in order (a `preferCurated`
 *    landmark goes first because its Google hero is known to be weak). Each
 *    credit renders only after its photo has loaded.
 * 2. Otherwise the place's own block on the self-hosted county basemap with a
 *    Brick pin, captioned with its street ("South Market St, near Carroll
 *    Creek"). It is real geography, so it is a picture, not a placeholder.
 * 3. Otherwise nothing: the identity block leads the page. The old 148px band
 *    with a category seal on a radial glow read as an empty placeholder, and
 *    the category pill repeated what the identity line already says.
 */
export default function PlaceHero({
  slug,
  name,
  aspectRatio = "16/10",
  size = "hero",
  priority = false,
  photoSrc,
  photoAttribution,
  googleMapsUri,
  map,
  address,
}: Props) {
  const width = size === "hero" ? 1200 : 600;
  const height = size === "hero" ? 700 : 400;
  const photos = heroPhotos({
    slug,
    name,
    width,
    photoSrc,
    photoAttribution,
    googleMapsUri,
    compact: size === "card",
  });
  const mapHero = map ? <PlaceHeroMap plan={map} placeName={name} address={address} /> : null;

  if (photos.length === 0) return mapHero;

  return (
    <PlaceHeroMedia
      key={photos.map((photo) => photo.src).join("|")}
      photos={photos}
      width={width}
      height={height}
      size={size}
      priority={priority}
      aspectRatio={aspectRatio}
      fallback={mapHero}
    />
  );
}

function heroPhotos({
  slug,
  name,
  width,
  photoSrc,
  photoAttribution,
  googleMapsUri,
  compact,
}: {
  slug: string;
  name: string;
  width: number;
  photoSrc?: string;
  photoAttribution?: GooglePhotoAttribution;
  googleMapsUri?: string;
  compact: boolean;
}): PlaceHeroPhoto[] {
  const landmark = getLandmarkPhoto(slug);
  const landmarkPhoto: PlaceHeroPhoto | null = landmark
    ? {
        src: wikimediaUrl(landmark.file, width),
        alt: landmark.alt,
        credit: <WikimediaCreditLine photo={landmark} />,
      }
    : null;
  const googlePhoto: PlaceHeroPhoto | null = photoSrc
    ? {
        src: photoSrc,
        alt: name,
        credit: (
          <GooglePhotoAttributionLine
            attribution={photoAttribution}
            placeGoogleMapsUri={googleMapsUri}
            compact={compact}
            touchTarget
          />
        ),
      }
    : null;
  const ordered = landmark?.preferCurated
    ? [landmarkPhoto, googlePhoto]
    : [googlePhoto, landmarkPhoto];
  return ordered.filter((photo): photo is PlaceHeroPhoto => photo !== null);
}

/** Commons credit, set inside the photo frame once the photo has loaded. */
function WikimediaCreditLine({ photo }: { photo: WikimediaPhoto }) {
  return (
    <span data-inline-prose className="text-xs leading-tight">
      Photo by{" "}
      <a
        href={photo.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-44-y inline-flex items-center underline underline-offset-2"
      >
        {photo.author}
      </a>{" "}
      · {photo.license} · Wikimedia Commons
    </span>
  );
}

/**
 * The photoless hero: a still map of the block from the self-hosted county
 * basemap (or the opt-in Static Images path, same switch as every other mini
 * map), with the Brick pin on the place. The caption names the street instead
 * of repeating the place name the h1 prints directly below. The whole frame
 * opens the same framing on /map.
 */
function PlaceHeroMap({
  plan,
  placeName,
  address,
}: {
  plan: PlaceHeroMapPlan;
  placeName: string;
  address?: string | null;
}) {
  const { lng, lat, caption } = plan;
  const pin = BRAND.colors.brick.slice(1).toLowerCase();
  return (
    <Link
      href={`/map?c=${lng.toFixed(5)},${lat.toFixed(5)},${MINI_MAP_ZOOM}`}
      prefetch={false}
      aria-label={`Open ${placeName} on the Radius map`}
      data-place-hero
      data-place-hero-kind="map"
      className="block"
    >
      {miniMapSource() === "static-image" ? (
        <StaticMapPreview
          src={`/api/static-map?lng=${lng.toFixed(4)}&lat=${lat.toFixed(4)}&pin=${pin}&size=320x150`}
          alt={`Map of ${caption}`}
          width={640}
          height={300}
          className="h-44 w-full"
        />
      ) : (
        <OwnedMiniMap lng={lng} lat={lat} zoom={MINI_MAP_ZOOM} name={caption} address={address} />
      )}
    </Link>
  );
}
