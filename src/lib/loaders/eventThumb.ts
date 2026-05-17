import { publicPlaceBySlug, decoratePlace } from "@/lib/loaders/places";
import type { EventWithMeta } from "@/lib/loaders/events";

/**
 * Give events a thumbnail by borrowing their venue's verified photo.
 *
 * Events have no images of their own, which is why the list read as a
 * wall of text. Most events happen *at a place* we now have a real
 * Google photo for (post the full enrichment run), so the honest,
 * zero-cost move is to show the venue's photo on the card.
 *
 * Server-only by design: it reads the canonical loaders (which import
 * the multi-MB enrichment JSON) and emits only a small proxied URL
 * string onto each event — so the heavy data never reaches the client
 * bundle. Pure over static data; events that already carry a
 * hero_image, or whose venue has no photo, pass through untouched.
 */
export function withVenueThumbs(events: EventWithMeta[]): EventWithMeta[] {
  return events.map((e) => {
    if (e.hero_image || !e.venue_place_slug) return e;
    const place = publicPlaceBySlug(e.venue_place_slug);
    if (!place) return e;
    const photo = decoratePlace(place).google_photo_url;
    return photo ? { ...e, hero_image: photo } : e;
  });
}
