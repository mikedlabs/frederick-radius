import { momentForEventSlug } from "@/data/civic-moments";
import { momentSectionId } from "./momentSectionId";

export type EventArrival = {
  /** The moment guide section that explains parking and shuttles. */
  href: string;
  /** The organizer's caveat, only when the guide cites where it came from. */
  note: { text: string; sourceUrl: string } | null;
};

/**
 * How to reach an event whose venue has no car access, or null for an
 * ordinary venue.
 *
 * Every surface that offers Directions for an event (the detail page, the
 * event sheet, the map peek) asks this first. Catoctin Colorfest closes
 * Frederick Road and has no parking at the park, so a driving route to the
 * venue point sends people onto a closed road; these surfaces offer the
 * guide's parking and shuttle section instead.
 */
export function eventArrival(eventSlug: string): EventArrival | null {
  const moment = momentForEventSlug(eventSlug);
  const venue = moment?.venue;
  if (!moment || !venue?.arrivalSection) return null;
  return {
    href: `/moments/${moment.slug}#${momentSectionId(venue.arrivalSection)}`,
    note:
      venue.note && venue.source_url
        ? { text: venue.note, sourceUrl: venue.source_url }
        : null,
  };
}
