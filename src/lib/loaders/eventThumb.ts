// Client-safe slim set (already decorated) — NOT @/lib/loaders/places
// (static-imports the ~12MB enrichment into client bundles).
import { clientPlaces, clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { PlaceCardData } from "@/lib/loaders/places";
import { haversineMeters } from "@/lib/geo";

/**
 * Give events a thumbnail by borrowing their venue's verified photo.
 *
 * Events have no images of their own, which is why the list read as a
 * wall of text. Most events happen *at a place* we now have a real
 * Google photo for (post the full enrichment run), so the honest,
 * zero-cost move is to show the venue's photo on the card.
 *
 * Two paths in order of trust:
 *   1. `venue_place_slug` is set — direct lookup, the canonical link.
 *   2. Fuzzy venue-name match — normalize both sides, require an
 *      exact normalized match. To avoid wrongly attaching a Frederick
 *      "Brewer's Alley" photo to a same-named place in another town,
 *      we also require the matched place to be within 800m of the
 *      event's geom (effectively "same physical building / block").
 *
 * Server-only by design: imports the multi-MB enrichment JSON and
 * emits only a small proxied URL string onto each event.
 */
const normLoose = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

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

function findByVenueName(name: string, eventGeom: EventWithMeta["geom"]): PlaceCardData | null {
  const k = normLoose(name);
  if (!k) return null;
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
  //    vice versa), guarded by a TIGHT 300m radius (the event is geocoded to
  //    the venue, so this is effectively the same building) and a 5-char floor
  //    on both sides so a stray "bar"/"hall" can't sweep in a wrong photo.
  if (k.length >= 5) {
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
    let place: PlaceCardData | null | undefined = null;
    if (e.venue_place_slug) place = clientPlaceBySlug(e.venue_place_slug);
    if (!place && e.venue_name) place = findByVenueName(e.venue_name, e.geom);
    if (!place) return e;
    const photo = place.google_photo_url;
    return photo ? { ...e, hero_image: photo } : e;
  });
}
