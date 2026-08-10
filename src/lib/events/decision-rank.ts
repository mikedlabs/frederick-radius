import { eventHasPreciseLocation } from "@/lib/events/geo-confidence";
import { hasPhysicalAttendance } from "@/lib/events/attendance";
import {
  compareForLead,
  eventLeadTier,
  eventProminence,
} from "@/lib/events/lead-rank";
import { haversineMeters, type LngLat } from "@/lib/geo";
import type { EventWithMeta } from "@/lib/loaders/events";

/**
 * Apply a consented device origin to event rows without turning an area
 * centroid into a fake distance. The returned copies are safe to hand to the
 * shared event cards; the source rows are never mutated.
 */
export function eventsWithDecisionDistance<T extends EventWithMeta>(
  events: readonly T[],
  origin: LngLat,
): T[] {
  return events.map((event) => {
    const distance =
      hasPhysicalAttendance(event) && eventHasPreciseLocation(event)
        ? haversineMeters(origin, event.geom)
        : undefined;
    return { ...event, distance_m: distance };
  });
}

/**
 * Near-me ranking is still editorial, not a nearest-pin dump. A real draw or
 * owner-featured event keeps its tier; proximity settles comparable choices
 * before imagery and time. Rows whose location is only a town/feed centroid
 * stay eligible but cannot win by pretending to be a few feet away.
 */
export function compareEventsForDecision(
  a: EventWithMeta,
  b: EventWithMeta,
  featured?: ReadonlySet<string>,
): number {
  if (featured && featured.size > 0) {
    const aFeatured = featured.has(a.slug);
    const bFeatured = featured.has(b.slug);
    if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
  }

  const aTier = eventLeadTier(a);
  const bTier = eventLeadTier(b);
  if (aTier !== bTier) return aTier - bTier;

  const aProminence = eventProminence(a);
  const bProminence = eventProminence(b);
  if (aProminence !== bProminence) return bProminence - aProminence;

  const aHasDistance = Number.isFinite(a.distance_m);
  const bHasDistance = Number.isFinite(b.distance_m);
  if (aHasDistance && bHasDistance && a.distance_m !== b.distance_m) {
    return a.distance_m! - b.distance_m!;
  }
  if (aHasDistance !== bHasDistance) return aHasDistance ? -1 : 1;

  return compareForLead(a, b);
}
