import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import LEGACY_PHOTO_RAW from "@/data/places-photos.json" with { type: "json" };
import { BREWERIES } from "@/data/beers";
import {
  publishableGooglePhotoAttribution,
  publishableGooglePhotoNames,
} from "@/lib/google-photo-policy";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";

type BreweryPhotoEnrichment = {
  photo_names?: string[];
  photo_attributions?: GooglePhotoAttribution[];
};

export type BreweryPhotoAsset = {
  src: string;
  attribution: GooglePhotoAttribution;
};

export type BreweryPhotoMap = Readonly<
  Record<string, BreweryPhotoAsset | null>
>;

export type BreweryMediaCoverage = {
  breweries: number;
  legacyMirrorPresent: number;
  publishable: number;
  waitingForAttribution: number;
  noPhotoCandidate: number;
};

const ENRICHMENT = ENRICHMENT_RAW as Record<
  string,
  BreweryPhotoEnrichment
>;
const LEGACY_PHOTOS = LEGACY_PHOTO_RAW as Record<string, string>;

function photoProxy(
  photoName: string,
  slug: string,
  width = 1200,
): string {
  const params = new URLSearchParams({
    name: photoName,
    w: String(width),
    slug,
    // BreweryPhoto detects the 1×1 response and swaps to its richer local
    // fallback. This keeps a failed Google request from looking like a real
    // attributed photograph.
    fallback: "signal",
  });
  return `/api/place-photo?${params.toString()}`;
}

/**
 * Select a brewery image only when its Google photo resource has the exact
 * individual source metadata required by the shared publishing policy.
 *
 * `places-photos.json` is deliberately not a render source. Those URLs are
 * legacy first-party mirrors of Google bytes and carry no per-image
 * attribution record. The mirror is useful as an operator signal that a
 * visually reviewed candidate existed, but it cannot bypass the current
 * no-store transport and attribution rule.
 */
export function resolvePublishableBreweryPhoto(
  slug: string,
  enrichment: BreweryPhotoEnrichment | undefined,
  width = 1200,
): BreweryPhotoAsset | null {
  const photoNames = publishableGooglePhotoNames(
    enrichment?.photo_names ?? [],
    enrichment?.photo_attributions ?? [],
  );
  const photoName = photoNames[0];
  if (!photoName) return null;
  const attribution = publishableGooglePhotoAttribution(
    photoName,
    enrichment?.photo_attributions ?? [],
  );
  if (!attribution) return null;
  return {
    src: photoProxy(photoName, slug, width),
    attribution,
  };
}

export function breweryPhotoMap(): BreweryPhotoMap {
  return Object.fromEntries(
    BREWERIES.map((brewery) => [
      brewery.slug,
      resolvePublishableBreweryPhoto(
        brewery.slug,
        ENRICHMENT[brewery.slug],
      ),
    ]),
  );
}

export function breweryMediaCoverage(): BreweryMediaCoverage {
  let legacyMirrorPresent = 0;
  let publishable = 0;
  let waitingForAttribution = 0;

  for (const brewery of BREWERIES) {
    const hasLegacy = Boolean(LEGACY_PHOTOS[brewery.slug]);
    const asset = resolvePublishableBreweryPhoto(
      brewery.slug,
      ENRICHMENT[brewery.slug],
    );
    if (hasLegacy) legacyMirrorPresent += 1;
    if (asset) publishable += 1;
    if (hasLegacy && !asset) waitingForAttribution += 1;
  }

  return {
    breweries: BREWERIES.length,
    legacyMirrorPresent,
    publishable,
    waitingForAttribution,
    noPhotoCandidate: BREWERIES.length - legacyMirrorPresent,
  };
}
