import { placeCardPhotoPlan, type PlaceCardPhotoSource } from "@/lib/place-card-photo";

export type FreeSearchPlaceVisual = Exclude<PlaceCardPhotoSource, { kind: "google" }>;
export type SearchPlaceVisualInput = Parameters<typeof placeCardPhotoPlan>[0];

/** Find may reuse an exact reviewed photograph, but typing never buys Google
 * media. The canonical plan retains its subject and preferCurated exclusions. */
export function freeSearchPlaceVisual(place: SearchPlaceVisualInput): FreeSearchPlaceVisual | null {
  return placeCardPhotoPlan(place, 128).sources.find(
    (source): source is FreeSearchPlaceVisual => source.kind === "owned" || source.kind === "curated",
  ) ?? null;
}
