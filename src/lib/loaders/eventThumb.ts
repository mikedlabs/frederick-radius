// Client-safe slim set (already decorated) — NOT @/lib/loaders/places
// (static-imports the ~12MB enrichment into client bundles).
import { clientPlaces, clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { PlaceCardData } from "@/lib/loaders/places";
import { haversineMeters } from "@/lib/geo";
import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * Give events a thumbnail by borrowing their venue's verified photo.
 *
 * Events have no images of their own, which is why the list read as a
 * wall of text. Most events happen *at a place* we now have a real
 * Google photo for (post the full enrichment run), so the honest,
 * zero-cost move is to show the venue's photo on the card.
 *
 * Three paths in order of trust:
 *   1. `venue_place_slug` is set — direct lookup, the canonical link.
 *   2. Exact normalized venue-name match within 800m. To avoid wrongly
 *      attaching a Frederick "Brewer's Alley" photo to a same-named
 *      place in another town, the matched place must be within 800m of
 *      the event's geom (effectively "same physical building / block").
 *   3. Containment fallback (a feed's "Sky Stage" vs the place's
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
 * Server-only by design: imports the multi-MB enrichment JSON and
 * emits only a small proxied URL string onto each event.
 */
const normLoose = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// A venue name that is really just a place-name (a town, the county, the
// state) is not a venue — matching on it borrows a random nearby business's
// photo. Built from every municipality name AND slug plus the obvious region
// words, all normalized the same way venue names are.
const GENERIC_VENUE_TOKENS: Set<string> = new Set([
  ...MUNICIPALITIES.flatMap((m) => [normLoose(m.name), normLoose(m.slug)]),
  "frederick",
  "frederickcounty",
  "frederickmd",
  "frederickmaryland",
  "maryland",
  "md",
  "downtown",
  "downtownfrederick",
  "county",
  "online",
  "virtual",
  "tbd",
]);

let _byNorm: Map<string, PlaceCardData[]> | null = null;
function placesByNorm(): Map<string, PlaceCardData[]> {
  if (_byNorm) return _byNorm;
  const m = new Map<string, PlaceCardData[]>();
  for (const p of clientPlaces()) {
    const k = normLoose(p.name);
    if (!k) continue;
    const bucket = m.get(k);
    if (bucket) bucket.push(p);
    else m.set(k, [p]);
  }
  _byNorm = m;
  return m;
}

function findByVenueName(
  name: string,
  eventGeom: EventWithMeta["geom"],
  precise: boolean,
): PlaceCardData | null {
  const k = normLoose(name);
  if (!k) return null;
  // A bare town/region name is not a venue — bail before it can match (e.g. a
  // county event located only as "Frederick" must not borrow "<x> in Frederick").
  if (GENERIC_VENUE_TOKENS.has(k)) return null;
  // 1. Exact normalized name match within 800m (highest trust). Closest wins
  //    when two places share a name across the county.
  const bucket = placesByNorm().get(k);
  if (bucket && bucket.length > 0) {
    let best: { p: PlaceCardData; d: number } | null = null;
    for (const p of bucket) {
      const d = haversineMeters(eventGeom, p.geom);
      if (d <= 800 && (!best || d < best.d)) best = { p, d };
    }
    if (best) return best.p;
  }
  // 2. Containment fallback. A feed's venue name is often a SHORT form of the
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
      const pk = normLoose(p.name);
      if (pk.length < 5) continue;
      if (!pk.includes(k) && !k.includes(pk)) continue;
      const d = haversineMeters(eventGeom, p.geom);
      if (d <= 300 && (!best || d < best.d)) best = { p, d };
    }
    if (best) return best.p;
  }
  return null;
}

export function withVenueThumbs(events: EventWithMeta[]): EventWithMeta[] {
  return events.map((e) => {
    if (e.hero_image) return e;
    // A precise per-event geocode (not a feed centroid) is what makes the
    // fuzzy name-match's proximity gate meaningful — see findByVenueName.
    const precise =
      e.geo_confidence === "venue_match" || e.geo_confidence === "exact_address";
    let place: PlaceCardData | null | undefined = null;
    if (e.venue_place_slug) place = clientPlaceBySlug(e.venue_place_slug);
    if (!place && e.venue_name) place = findByVenueName(e.venue_name, e.geom, precise);
    if (!place) return e;
    const photo = place.google_photo_url;
    return photo ? { ...e, hero_image: photo } : e;
  });
}
