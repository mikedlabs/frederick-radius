import { eventCardVisual, type EventCardVisual } from "@/components/event/eventVisuals";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventPlaceId } from "@/lib/today/event-fields";

/**
 * Visual for a Today event card.
 *
 * Order:
 *  1. A source-approved event or credited venue image already on the row
 *     (never the archive / seasonal Radius photographs).
 *  2. The linked place's catalog photo when `place_id` resolves.
 *  3. Null — the card uses a calm category-colored treatment.
 */
export function todayEventVisual(
  event: EventWithMeta,
): EventCardVisual | null {
  const approved = eventCardVisual(event);
  if (approved && !approved.key.startsWith("radius-")) {
    return approved;
  }

  const placeId = eventPlaceId(event);
  if (!placeId) return null;

  const place = clientPlaceBySlug(placeId);
  const src = place?.google_photo_url?.trim();
  if (!place || !src) return null;

  return {
    src,
    caption: `Venue · ${place.name}`,
    key: `place:${place.slug}:${src}`,
  };
}
