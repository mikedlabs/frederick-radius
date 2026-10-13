import "server-only";

import PHOTO_CREDITS_RAW from "@/data/event-venue-photo-credits.json" with { type: "json" };
import PHOTO_SUPPRESS_RAW from "@/data/photo-suppress.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import type { Overrides } from "@/lib/overrides";
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
