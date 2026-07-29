import "server-only";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  clientPlaceBySlug,
  clientPlacesWithinRadius,
} from "@/lib/loaders/places-client";
import { postgisNearbyPlaceDistances } from "@/lib/spatial/place-spatial-index";
import { roundCoord } from "@/lib/walkTime";

const FOOD_CATEGORIES = new Set([
  "restaurant",
  "coffee",
  "bar",
  "brewery",
  "bakery",
  "pizza",
]);
const FOOD_RADIUS_M = 2_000;
const PARKING_RADIUS_M = 1_500;

export type EventNearbyPlaces = {
  food: PlaceCardData[];
  parking: PlaceCardData[];
  source: "postgis" | "catalog-fallback";
};

function selectNearby(
  distances: ReadonlyMap<string, number>,
): Pick<EventNearbyPlaces, "food" | "parking"> {
  const food: PlaceCardData[] = [];
  const parking: PlaceCardData[] = [];
  for (const [slug, distance] of distances) {
    const place = clientPlaceBySlug(slug);
    if (!place) continue;
    const withDistance = { ...place, distance_m: distance };
    if (
      food.length < 4 &&
      distance <= FOOD_RADIUS_M &&
      FOOD_CATEGORIES.has(place.category)
    ) {
      food.push(withDistance);
    }
    if (
      parking.length < 3 &&
      distance <= PARKING_RADIUS_M &&
      place.category === "parking"
    ) {
      parking.push(withDistance);
    }
    if (food.length === 4 && parking.length === 3) break;
  }
  return { food, parking };
}

/**
 * One bounded spatial read replaces two full publicPlaces/enrichment scans.
 * If the deployed place checksum is stale, PostGIS is unavailable, or its
 * deadline expires, the slim client catalog preserves the existing answer.
 */
export async function loadEventNearbyPlaces(
  event: Pick<EventWithMeta, "geom">,
): Promise<EventNearbyPlaces> {
  const origin = {
    lng: roundCoord(event.geom.lng),
    lat: roundCoord(event.geom.lat),
  };
  const spatial = await postgisNearbyPlaceDistances(origin, FOOD_RADIUS_M);
  if (spatial) {
    return { ...selectNearby(spatial), source: "postgis" };
  }

  const nearby = clientPlacesWithinRadius(event.geom, FOOD_RADIUS_M);
  return {
    food: nearby
      .filter((place) => FOOD_CATEGORIES.has(place.category))
      .slice(0, 4),
    parking: nearby
      .filter(
        (place) =>
          place.category === "parking" &&
          (place.distance_m ?? Infinity) <= PARKING_RADIUS_M,
      )
      .slice(0, 3),
    source: "catalog-fallback",
  };
}
