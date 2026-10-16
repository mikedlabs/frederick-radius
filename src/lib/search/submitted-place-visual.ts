import "server-only";
import { selectedPlacePhoto } from "@/lib/loaders/selectedPlacePhoto";
import type { PlaceCardData } from "@/lib/loaders/places";
import { placeCardPhotoPlan, type PlaceCardPhotoSource } from "@/lib/place-card-photo";
import { freeSearchPlaceVisual } from "./place-visual";

/** A submitted search can spend its existing bounded allowance on a few
 * individually credited Google photos. Free photos never consume that budget,
 * and unused slots never expand the caller's original ranked-index eligibility. */
export function submittedSearchPlaceVisuals(
  places: readonly PlaceCardData[],
  paidLimit: number,
  paidEligibleSlugs: ReadonlySet<string>,
): Map<string, PlaceCardPhotoSource> {
  const photos = new Map<string, PlaceCardPhotoSource>();
  const limit = Number.isFinite(paidLimit) ? Math.max(0, Math.floor(paidLimit)) : 0;
  let paidCount = 0;
  for (const place of places) {
    if (photos.has(place.slug)) continue;
    const free = freeSearchPlaceVisual(place);
    if (free) {
      photos.set(place.slug, free);
      continue;
    }
    if (paidCount >= limit || !paidEligibleSlugs.has(place.slug)) continue;
    const selected = selectedPlacePhoto(place.slug, place);
    if (!selected) continue;
    const source = placeCardPhotoPlan({ ...place, google_photo_url: selected.url,
      google_photo_attribution: selected.attribution }, 128).sources.find((photo) => photo.kind === "google");
    if (!source) continue;
    photos.set(place.slug, source);
    paidCount += 1;
  }
  return photos;
}
