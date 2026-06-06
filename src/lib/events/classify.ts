import type { EventStatus } from "@/lib/event-status";

/**
 * Event eligibility lanes — the "belongs-to-feed ≠ should-be-promoted"
 * fix (#436, applied to events). County/municipal feeds publish a mix of
 * real public events, board meetings, trash reminders, facility rentals,
 * and cancelled items all as "events"; the category is blank for the
 * county feed, so the old `isCivicEvent` (category === "civic") couldn't
 * catch any of them and they leaked into "What's on".
 *
 * Classify by TITLE only (descriptions are noise — matching them flagged
 * "Asia On The Creek" as a meeting because its blurb said "board"), with
 * word-boundary, specific phrases (never substrings like "grass" inside
 * "Bluegrass"), and a CONSERVATIVE default of `public`: better to let one
 * stray meeting through than hide a festival. Pure + unit-tested; validated
 * against the live feed so no real event is mislaned.
 */
export type EventLane =
  | "public"
  | "civic_meeting"
  | "town_reminder"
  | "private_rental"
  | "cancelled";

// Private/internal — a wedding or corporate booking is not "something to do".
const RE_RENTAL =
  /\b(wedding|reception|banquet)\b|\bprivate\b[^|]*\b(event|party|booking|rental|reservation|corp)\b|\bcorporate (event|party|booking)\b|facility rental|pavilion (reservation|rental)/i;

// Municipal service / public-works reminders — keep, but in their own lane.
const RE_REMINDER =
  /\bbulk\s*trash\b|\byard\s*waste\b|\bcurbside\b|\bleaf\s*(collection|pickup|removal)\b|\brecycling\b|\b(trash|refuse)\s*(pickup|collection|day)\b|street\s*sweep|\b(road|lane|street)\s*closure\b|snow\s*(emergency|operations|removal)|\bmowing\b/i;

// Boards / commissions / hearings / council sessions. Deliberately NOT a
// bare "board"/"council" (would catch "Arts Council", "skateboard").
const RE_MEETING =
  /\badvisory\s+board\b|\bboard\s+of\s+(education|county\s+commissioners|appeals|zoning|elections|health|trustees)\b|\b(planning|zoning|ethics|election|historic\s+preservation)\s+commission\b|\bpublic\s+hearing\b|\bcouncil\s+(meeting|workshop|work\s*session|legislative|session)\b|\b(city|town)\s+council\b|\b(committee|subcommittee)\s+meeting\b|\bwork\s*session\b|town\s+hall\s+meeting/i;

const RE_CANCELLED = /\bcancell?ed\b|\bpostponed\b/i;

export function classifyEvent(
  e: { title: string; status?: EventStatus | string; category?: string },
): EventLane {
  const t = e.title ?? "";
  if (e.status === "cancelled" || e.status === "postponed" || RE_CANCELLED.test(t)) {
    return "cancelled";
  }
  if (RE_RENTAL.test(t)) return "private_rental";
  if (RE_REMINDER.test(t)) return "town_reminder";
  if (RE_MEETING.test(t) || e.category === "civic") return "civic_meeting";
  return "public";
}

/** True only for events that may lead the public "What's on" surfaces. */
export function isPublicEvent(e: { title: string; status?: EventStatus | string; category?: string }): boolean {
  return classifyEvent(e) === "public";
}
