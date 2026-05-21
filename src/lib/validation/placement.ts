/**
 * Coordinate validation + placement tagging.
 *
 * This is where the FrederickRadius brief's "place is verified, not
 * guessed" rule is enforced. Every event and place flows through one
 * of these helpers before it reaches a public surface:
 *
 *   - Events get tagged with placement = "venue" | "geocoded" |
 *     "needs_review" based on whether their venue_place_slug resolves
 *     to a real place and whether the resulting coord sits inside the
 *     county bbox.
 *   - Places (which are venues by definition) get checked for bbox
 *     membership; anything outside is treated as needs_review.
 *
 * Rows tagged needs_review are dropped from public surfaces and
 * surfaced on /admin/data-health so they are visible to an editor
 * before they are visible to a user.
 */

import type { Event } from "@/data/events";
import type { Place } from "@/data/places";
import { isValidCoord } from "@/lib/geo";

export type Placement = "venue" | "geocoded" | "needs_review";

/** A minimal place index for resolving venue_place_slug → coords. The
 *  events loader passes this in so we do not pull the heavy places
 *  loader transitively into every event surface. */
export type VenueResolver = (slug: string) =>
  | { lng: number; lat: number }
  | null
  | undefined;

/**
 * Decide an event's placement and return the event annotated with it.
 * Pure: takes a venue resolver as a dependency so the events loader
 * can swap in the production resolver while tests can stub one.
 *
 * Rules, in order:
 *   1. If venue_place_slug resolves to a place with a valid coord,
 *      placement = "venue". (The brief: never re-geocode an event
 *      that has a venueId.)
 *   2. Else, if the event's own geom is a valid in-county coord,
 *      placement = "geocoded".
 *   3. Else, placement = "needs_review". The event keeps whatever
 *      geom it had; downstream filters drop it from public render.
 */
export function tagEventPlacement(
  e: Event,
  resolveVenue: VenueResolver,
): Event & { placement: Placement } {
  if (e.venue_place_slug) {
    const venueCoord = resolveVenue(e.venue_place_slug);
    if (venueCoord && isValidCoord(venueCoord)) {
      // Inherit the verified venue coordinate exactly. This is what
      // closes the "two sources, two coordinates, drifting marker"
      // failure mode the brief calls out.
      return {
        ...e,
        geom: { lng: venueCoord.lng, lat: venueCoord.lat },
        placement: "venue",
      };
    }
  }
  if (isValidCoord(e.geom)) {
    return { ...e, placement: "geocoded" };
  }
  return { ...e, placement: "needs_review" };
}

/** Apply tagEventPlacement to a list and split into the in-public set
 *  and the needs-review set in one pass. */
export function partitionEvents(
  events: Event[],
  resolveVenue: VenueResolver,
): {
  public: Array<Event & { placement: Placement }>;
  needsReview: Array<Event & { placement: "needs_review" }>;
} {
  const pub: Array<Event & { placement: Placement }> = [];
  const review: Array<Event & { placement: "needs_review" }> = [];
  for (const raw of events) {
    const tagged = tagEventPlacement(raw, resolveVenue);
    if (tagged.placement === "needs_review") {
      review.push(tagged as Event & { placement: "needs_review" });
    } else {
      pub.push(tagged);
    }
  }
  return { public: pub, needsReview: review };
}

/** Same idea for places. A place IS a venue, so it either has a valid
 *  coord (counted in the public set) or it goes to needs_review. */
export function partitionPlaces(places: Place[]): {
  public: Place[];
  needsReview: Place[];
} {
  const pub: Place[] = [];
  const review: Place[] = [];
  for (const p of places) {
    if (isValidCoord(p.geom)) pub.push(p);
    else review.push(p);
  }
  return { public: pub, needsReview: review };
}

/**
 * Server-side build-time log. Prints a single concise warning per
 * batch so a future seed bug that pushes off-bbox rows is visible in
 * the build output. No-op in the browser.
 */
export function logPlacementWarnings(
  kind: "events" | "places",
  needsReview: Array<{ slug?: string; venue_name?: string; name?: string }>,
): void {
  if (typeof window !== "undefined") return;
  if (needsReview.length === 0) return;
  const sample = needsReview
    .slice(0, 5)
    .map((r) => r.slug ?? r.name ?? r.venue_name ?? "<unknown>")
    .join(", ");
  console.warn(
    `[placement] ${kind}: ${needsReview.length} row(s) flagged needs_review (off-bbox or missing coord). Examples: ${sample}`,
  );
}
