import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
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
  photoCandidates: number;
  publishable: number;
  waitingForAttribution: number;
  noPhotoCandidate: number;
};

const ENRICHMENT = ENRICHMENT_RAW as Record<
  string,
  BreweryPhotoEnrichment
>;

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
 * Photo resource names alone are deliberately not a render source. Publishing
 * requires an exact per-image source record and the no-store transport below.
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
  let photoCandidates = 0;
  let publishable = 0;
  let waitingForAttribution = 0;

  for (const brewery of BREWERIES) {
    const enrichment = ENRICHMENT[brewery.slug];
    const hasCandidate = Boolean(enrichment?.photo_names?.length);
    const asset = resolvePublishableBreweryPhoto(
      brewery.slug,
      enrichment,
    );
    if (hasCandidate) photoCandidates += 1;
    if (asset) publishable += 1;
    if (hasCandidate && !asset) waitingForAttribution += 1;
  }

  return {
    breweries: BREWERIES.length,
    photoCandidates,
    publishable,
    waitingForAttribution,
    noPhotoCandidate: BREWERIES.length - photoCandidates,
  };
}
