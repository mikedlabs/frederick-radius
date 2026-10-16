import "server-only";

import PHOTO_CREDITS_RAW from "@/data/event-venue-photo-credits.json" with { type: "json" };
import PHOTO_SUPPRESS_RAW from "@/data/photo-suppress.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import type { Overrides } from "@/lib/overrides";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import {
  bindSelectedPlacePhotoCredit,
  type SelectedPlacePhoto,
  type SelectedPlacePhotoRecord,
} from "@/lib/selected-place-photo-credit";

const PHOTO_CREDITS = PHOTO_CREDITS_RAW as Record<string, unknown>;
const PHOTO_SUPPRESS = new Set(PHOTO_SUPPRESS_RAW.slugs);
const PHOTO_PATCHES = (OVERRIDES_RAW as Overrides).patch;

/**
 * On-demand projection only. The generated credit index stays on the server;
 * the canonical full loader already pairs its own images and is not imported.
 * Current editorial suppression wins even if an older client artifact retains
 * a previously approved URL and policy flag.
 */
export function selectedPlacePhoto(
  requestedSlug: string,
  place: SelectedPlacePhotoRecord,
): SelectedPlacePhoto | undefined {
  const patch = PHOTO_PATCHES?.[place.slug];
  if (
    requestedSlug !== place.slug ||
    PHOTO_SUPPRESS.has(place.slug) ||
    patch?.clearPhoto ||
    patch?.clearEnrichment
  ) {
    return undefined;
  }
  const embedded = bindSelectedPlacePhotoCredit(
    requestedSlug,
    place,
    place.google_photo_attribution,
  );
  if (embedded) return embedded;
  if (!Object.hasOwn(PHOTO_CREDITS, place.slug)) return undefined;
  return bindSelectedPlacePhotoCredit(
    requestedSlug,
    place,
    PHOTO_CREDITS[place.slug],
  );
}

/** Wire fields the card check needs after it binds identity from the proxy URL. */
export function primaryGooglePhotoAttribution(
  attribution: SelectedPlacePhoto["attribution"],
): GooglePhotoAttribution {
  return {
    google_maps_uri: attribution.google_maps_uri,
    authors: attribution.authors.map((author) => ({
      display_name: author.display_name,
      uri: author.uri,
    })),
  } as GooglePhotoAttribution;
}

/**
 * Restore the primary Google hero credit onto a slim catalog row. The client
 * JSON keeps only the policy flag; list hydration still has to show Google's
 * required author/source pair. Extra gallery attributions stay off the wire.
 */
export function withPrimaryGooglePhotoCredit<T extends SelectedPlacePhotoRecord>(
  place: T,
): T {
  const photo = selectedPlacePhoto(place.slug, place);
  if (!photo) return place;
  return {
    ...place,
    google_photo_url: photo.url,
    google_photo_attribution: primaryGooglePhotoAttribution(photo.attribution),
  };
}
