import { formatDistance } from "@/lib/geo";

/**
 * Copy for the Nearby list's summary line and its thin Open now state.
 *
 * The November 11, 2026 hierarchy audit found the food list leading with
 * "1 confirmed open · 204 nearby · available first" and then showing rows
 * that all read "Hours not confirmed". The summary now says the order first,
 * in complete sentences (`rightNowOrderSentence`), and the counts follow as
 * supporting detail. Nothing here claims a place is closed unless the hours
 * coverage allows it (`mayReportNoneOpen`).
 */

const places = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "place" : "places"}`;
const withPhrase = (phrase?: string | null) => (phrase ? ` ${phrase}` : "");

export type NearbyCountMode =
  /** Hours matter and the whole match set is listed. */
  | "hours"
  /** Open now is on and enough places nearby are confirmed open. */
  | "open-only"
  /** Closing soon is on: open, but closing within the hour. */
  | "closing-soon"
  /** The craving does not depend on hours (parks, lodging). */
  | "no-hours"
  /** A shared link carries an hours filter this craving no longer offers. */
  | "legacy-filter";

export function nearbyCountSentence({
  mode,
  total,
  openCount,
  mayReportNoneOpen,
  phrase,
}: {
  mode: NearbyCountMode;
  /** Every place that matches before an Open now filter. */
  total: number;
  /** How many of those are confirmed open right now, closing soon, or match
   *  the legacy filter, depending on the mode. */
  openCount: number;
  mayReportNoneOpen: boolean;
  /** A meal's framing, such as "for dinner". */
  phrase?: string | null;
}): string {
  if (mode === "no-hours") return `${places(total)} ${total === 1 ? "matches" : "match"}.`;
  if (mode === "legacy-filter") {
    return `${places(openCount)} ${openCount === 1 ? "matches" : "match"} this link's hours filter.`;
  }
  if (mode === "closing-soon") {
    return `${places(openCount)} ${openCount === 1 ? "is" : "are"} open and closing within the hour.`;
  }
  if (mode === "open-only") {
    return `${places(openCount)} ${openCount === 1 ? "is" : "are"} confirmed open${withPhrase(phrase)} right now.`;
  }
  if (openCount > 0) {
    return `${openCount.toLocaleString("en-US")} of ${places(total)} ${openCount === 1 ? "is" : "are"} confirmed open${withPhrase(phrase)} right now.`;
  }
  if (total === 1) {
    return mayReportNoneOpen
      ? `This place is not open${withPhrase(phrase)} right now.`
      : `This place has no confirmed open hours${withPhrase(phrase)} right now.`;
  }
  return mayReportNoneOpen
    ? `None of the ${places(total)} are open${withPhrase(phrase)} right now.`
    : `None of the ${places(total)} have confirmed open hours${withPhrase(phrase)} right now.`;
}

/** Below this many confirmed-open places nearby, Open now keeps the nearest
 * places on screen instead of leaving one far result with nothing after it. */
export const OPEN_NOW_THIN_COUNT = 3;

/** "Nearby" for a device fix: about three miles. The audit's failed walk left
 * one restaurant 6.2 miles away as the whole Open now answer. */
export const OPEN_NOW_NEARBY_RADIUS_M = 4_800;

/**
 * The one plain line above the nearest places when Open now finds almost
 * nothing nearby. `area` reads inside the sentence: "nearby", "in Thurmont"
 * or "in the county". `closestOpen` is the nearest confirmed-open place
 * outside that area, passed only when nothing inside it is open and its
 * distance is measured from where the visitor is.
 */
export function openNowThinNote({
  nearbyOpen,
  area,
  phrase,
  closestOpen,
  order = "nearest",
}: {
  nearbyOpen: number;
  area: string;
  phrase?: string | null;
  closestOpen?: { distance_m: number; town: string | null } | null;
  /** How the rows below are ordered, so the note names the same order:
   * by distance from a trustworthy origin, by rating, or by best match. */
  order?: "nearest" | "rated" | "best";
}): string {
  const listed = order === "nearest" ? "the nearest places" : order === "rated" ? "the top rated places" : "the best matches";
  if (nearbyOpen > 0) {
    return `Only ${places(nearbyOpen)} ${area} ${nearbyOpen === 1 ? "is" : "are"} confirmed open${withPhrase(phrase)} right now, so ${nearbyOpen === 1 ? "it is" : "they are"} marked among ${listed}.`;
  }
  const lead = `Nothing ${area} is confirmed open${withPhrase(phrase)} right now, so ${listed} are shown instead.`;
  if (!closestOpen) return lead;
  const where = closestOpen.town ? `, in ${closestOpen.town}` : "";
  return `${lead} The closest place confirmed open is ${formatDistance(closestOpen.distance_m)} away${where}.`;
}

/**
 * The first `limit` rows, plus any later row `mustShow` accepts, in list
 * order. The thin Open now note says the few confirmed-open places nearby are
 * marked in the list, so the row limit may never cut one of them.
 */
export function keepListedRows<T>(list: readonly T[], limit: number, mustShow: (row: T) => boolean): T[] {
  return [...list.slice(0, limit), ...list.slice(limit).filter(mustShow)];
}
