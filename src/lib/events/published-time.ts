import type { Event } from "@/data/events";
import { eventHasTrustworthyEnd, isDateOnlyEventAnchor } from "@/lib/eventWhenLabel";
import { easternParts } from "@/lib/tz";

/** These historical iCal, CivicEngage, Tribe, Wix, campus and Vibemap
 * adapters substituted two hours for an absent end. A legacy row of that
 * length cannot prove its duration. New records carry the publisher evidence. */
const LEGACY_TWO_HOUR_FEEDS = new Set([
  "celebrate", "county", "hood", "city-frederick", "fair", "mount-airy", "thurmont",
  "heritage-frederick", "monocacy", "msd", "mdcc", "parks", "delaplaine", "isf",
  "elc", "civil-war-med", "maryland-ensemble", "catoctin", "fcc", "mount-st-marys", "dfp",
]);

type Timing = Pick<Event, "starts_at" | "ends_at" | "is_all_day" | "published_time"> & { source?: string };

/** Public timing claims are independent of the expiry window used by the feed. */
export function publishedEventTime(event: Timing): NonNullable<Event["published_time"]> {
  if (event.is_all_day || isDateOnlyEventAnchor(event) || event.published_time === "date") return "date";
  if (event.published_time === "start" || !eventHasTrustworthyEnd(event)) return "start";
  if (event.published_time === "range") return "range";
  if (event.source === "frederick-keys") return "start";
  const start = new Date(event.starts_at);
  if (event.source && LEGACY_TWO_HOUR_FEEDS.has(event.source) && Date.parse(event.ends_at) - start.getTime() === 7_200_000) {
    // The county RSS adapter formerly anchored a time it couldn't parse at noon.
    if (event.source === "county" && easternParts(start).hour === 12 && start.getUTCMinutes() === 0) return "date";
    return "start";
  }
  return "range";
}
