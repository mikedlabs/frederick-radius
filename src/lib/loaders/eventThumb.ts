// Client-safe slim set (already decorated) — NOT @/lib/loaders/places
// (static-imports the ~12MB enrichment into client bundles).
import { clientPlaces } from "@/lib/loaders/places-client";
import VENUE_PHOTO_CREDITS_RAW from "@/data/event-venue-photo-credits.json" with { type: "json" };
import type { EventHeroImageAttribution } from "@/data/events";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { PlaceCardData } from "@/lib/loaders/places";
import { haversineMeters } from "@/lib/geo";
import {
  isGenericEventVenueName,
  normalizeEventVenueIdentity,
  resolveReviewedEventVenue,
} from "@/lib/events/venue-resolver";

type VenuePhotoCredit = {
  google_maps_uri: string;
  flag_content_uri?: string;
  authors: EventHeroImageAttribution["authors"];
};

const VENUE_PHOTO_CREDITS = VENUE_PHOTO_CREDITS_RAW as Record<
  string,
  VenuePhotoCredit
>;

function isPlacePhotoProxy(value?: string): boolean {
  return Boolean(value?.startsWith("/api/place-photo"));
}

function venuePhotoAttribution(
  place: PlaceCardData,
): EventHeroImageAttribution | null {
  const credit = VENUE_PHOTO_CREDITS[place.slug];
  if (!credit?.google_maps_uri?.startsWith("https://")) return null;
  return {
    kind: "venue",
    venue_name: place.name,
    provider: "google_maps",
    source_uri: credit.google_maps_uri,
    flag_content_uri: credit.flag_content_uri,
    authors: credit.authors ?? [],
  };
}

/**
 * Give events a thumbnail by borrowing their venue's verified photo.
 *
 * Events have no images of their own, which is why the list read as a
 * wall of text. Most events happen *at a place* we now have a real
 * Google photo for (post the full enrichment run), so the honest,
 * zero-cost move is to show the venue's photo on the card.
 *
 * Two paths in order of trust:
 *   1. The shared venue resolver accepts an exact canonical slug, reviewed
 *      alias, or unique exact normalized identity. These are the same matches
 *      trusted to anchor event geometry.
 *   2. Containment fallback (a feed's "Sky Stage" vs the place's
 *      "Frederick Arts Council Sky Stage") — but ONLY for events whose
 *      geom is a precise per-event geocode, never a feed centroid.
 *
 * TRUST GATES (why a county "...on the Farm" event used to wear a
 * downtown gift shop's photo):
 *   - A bare town/region name is not a venue. We never match when the
 *     venue name normalizes to a municipality token, so an event whose
 *     location is just "Frederick" can't borrow "<x> in Frederick"'s
 *     photo via containment.
 *   - The proximity gate only means "same building" when the geocode is
 *     real. Most live-feed rows sit on their feed's *centroid* (geo
 *     confidence "area"), where 300m near downtown sweeps in dozens of
 *     unrelated places — so the fuzzy containment path is gated to
 *     precise ("venue_match"/"exact_address") geocodes only. Everything
 *     uncertain falls back to the engraved category plate, which is
 *     honest, not a guessed photo.
 *
 * Server-only by design. The client place catalog supplies the image URL while
 * a generated, compact credit artifact supplies the matching author and direct
 * Google Maps source. A venue photo is never attached without both halves.
 */
function findFuzzyVenueForPhoto(
  name: string,
  eventGeom: EventWithMeta["geom"],
  precise: boolean,
): PlaceCardData | null {
  const k = normalizeEventVenueIdentity(name);
  if (!k) return null;
  // A bare town/region name is not a venue — bail before it can match (e.g. a
  // county event located only as "Frederick" must not borrow "<x> in Frederick").
  if (isGenericEventVenueName(name)) return null;
  // Containment fallback. A feed's venue name is often a SHORT form of the
  //    place's official name ("Sky Stage" vs "Frederick Arts Council Sky
  //    Stage"), so the exact match above misses it and the card falls back to a
  //    glyph. Accept a place whose normalized name contains the venue token (or
  //    vice versa), guarded by a TIGHT 300m radius and a 5-char floor on both
  //    sides so a stray "bar"/"hall" can't sweep in a wrong photo.
  //    GATED ON PRECISE GEOCODE: 300m only means "same building" when the event
  //    is geocoded to its actual address. A feed-centroid event ("area") sits
  //    in the middle of downtown, where 300m sweeps in dozens of unrelated
  //    places — the exact source of wrong-photo bugs — so we skip fuzzy
  //    containment for it entirely and let the category plate carry the card.
  if (precise && k.length >= 5) {
    let best: { p: PlaceCardData; d: number } | null = null;
    for (const p of clientPlaces()) {
      const pk = normalizeEventVenueIdentity(p.name);
      if (pk.length < 5) continue;
      if (!pk.includes(k) && !k.includes(pk)) continue;
      const d = haversineMeters(eventGeom, p.geom);
      if (d <= 300 && (!best || d < best.d)) best = { p, d };
    }
    if (best) return best.p;
  }
  return null;
}

/**
 * Single-event form of withVenueThumbs, for the /events/[slug] detail
 * resolvers. The list card borrows the venue photo via the unified
 * assembly, but the slug resolvers returned the raw feed row — so the
 * DETAIL page rendered the gradient fallback for an event whose list
 * card had a real photo (image audit 2026-07-07). Same trust gates.
 */
export function withVenueThumb(e: EventWithMeta): EventWithMeta {
  return withVenueThumbs([e])[0];
}

export function withVenueThumbs(events: EventWithMeta[]): EventWithMeta[] {
  return events.map((e) => {
    // Publisher-provided event art stays intact. A place-photo proxy is
    // different: it must be rejoined to its canonical venue credit below or
    // fail closed, even when an upstream row already carried the URL.
    if (e.hero_image && !isPlacePhotoProxy(e.hero_image)) return e;
    // A precise per-event geocode (not a feed centroid) is what makes the
    // fuzzy name-match's proximity gate meaningful.
    const precise =
      e.geo_confidence === "venue_match" || e.geo_confidence === "exact_address";
    let place: PlaceCardData | null | undefined =
      resolveReviewedEventVenue(e)?.place;
    if (!place && e.venue_name) {
      // This is intentionally photo-only. Fuzzy containment never stamps a
      // canonical slug and never moves a marker, even when the photo is safe.
      place = findFuzzyVenueForPhoto(e.venue_name, e.geom, precise);
    }
    if (!place) {
      return isPlacePhotoProxy(e.hero_image)
        ? { ...e, hero_image: undefined, hero_image_attribution: undefined }
        : e;
    }
    const photo = place.google_photo_url;
    const attribution = venuePhotoAttribution(place);
    if (!photo || !attribution) {
      return isPlacePhotoProxy(e.hero_image)
        ? { ...e, hero_image: undefined, hero_image_attribution: undefined }
        : e;
    }
    return {
      ...e,
      hero_image: photo,
      hero_image_attribution: attribution,
    };
  });
}
