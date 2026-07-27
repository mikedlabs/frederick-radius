import CLIENT_HOURS_RAW from "@/data/places-client-hours.json" with { type: "json" };
import type { Hours } from "@/data/places";
import { isHoursFresh } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";

export type ClientPlaceHours = {
  slug: string;
  hours: Hours;
  hours_verified: true;
  hours_updated_at?: string;
  hours_policy_strict: boolean;
};

const CLIENT_HOURS = CLIENT_HOURS_RAW as ClientPlaceHours[];

/**
 * Compact, client-safe schedule data for the map time scrubber.
 *
 * The separate generated artifact keeps the photo-rich place catalog out of
 * AppMap's client chunks. Reapply the same runtime freshness and public
 * visitability checks as the full client loader so a long-lived deployment
 * cannot keep asserting an old open/closed state.
 */
export function clientPlaceHours(
  now: Date = new Date(),
): ClientPlaceHours[] {
  return CLIENT_HOURS.filter(
    (place) =>
      (!place.hours_policy_strict ||
        isHoursFresh(place.hours_updated_at, now)) &&
      mayPublishVisitabilityHours(place.slug, place.hours, now),
  );
}
