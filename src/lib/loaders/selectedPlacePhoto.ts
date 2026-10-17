import "server-only";

import PHOTO_CREDITS_RAW from "@/data/event-venue-photo-credits.json" with { type: "json" };
import PHOTO_SUPPRESS_RAW from "@/data/photo-suppress.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import type { Overrides } from "@/lib/overrides";
import { isPaidGooglePhotoUrl } from "@/lib/google-photo-policy";
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

/**
 * Restore only the selected hero's verified URL and complete source record.
 * Rejected Google metadata must not survive on a stale slim catalog row and
 * bypass the current suppression or identity checks in a client photo plan.
 * First-party and other non-Google URLs keep their existing behavior.
 */
export function withPrimaryGooglePhotoCredit<T extends SelectedPlacePhotoRecord>(
  place: T,
): T {
  const photo = selectedPlacePhoto(place.slug, place);
  if (photo) {
    return {
      ...place,
      google_photo_url: photo.url,
      google_photo_attribution: photo.attribution,
    };
  }

  const paidGoogleUrl = isPaidGooglePhotoUrl(place.google_photo_url);
  if (!paidGoogleUrl && !place.google_photo_attribution) return place;
  return {
    ...place,
    ...(paidGoogleUrl ? { google_photo_url: undefined } : {}),
    google_photo_attribution: undefined,
  };
}
