import { placeCardPhotoPlan, type PlaceCardPhotoPlan } from "@/lib/place-card-photo";
import { localDiscoveryPlace } from "./discovery-places";
import { todayAppearancePhotoPlan } from "./place-photo-appearance";

/** Use Today's accepted scenic identities or an exact current-appearance
 * review. A saved membership is not image approval; no provider is hydrated. */
export function todaySavedPlacePhotoPlan(slug: string): PlaceCardPhotoPlan {
  const scenic = localDiscoveryPlace(slug);
  if (scenic) return scenic.photoPlan;
  const reviewed = todayAppearancePhotoPlan(slug, placeCardPhotoPlan({ slug }, 400));
  const sources = reviewed.sources.filter(source => source.kind !== "google"
    && source.src.startsWith("/") && !source.src.startsWith("//") && !source.src.startsWith("/api/"));
  return { key: JSON.stringify([reviewed.key, sources]), sources };
}
