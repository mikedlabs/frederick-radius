import type { EventStatus } from "@/lib/event-status";
import {
  hasActionableAttendance,
  type EventAttendanceInput,
} from "@/lib/events/attendance";

/**
 * Event eligibility lanes — the "belongs-to-feed ≠ should-be-promoted"
 * fix (#436, applied to events). County/municipal feeds publish a mix of
 * real public events, board meetings, trash reminders, facility rentals,
 * social-page artifacts, and cancelled items all as "events"; the category
 * is blank for the county feed, so the old `isCivicEvent` (category ===
 * "civic") couldn't catch any of them and they leaked into "What's on".
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
  | "non_event"
  | "closure_notice"
  | "cancelled";

// Private/internal — a wedding, reunion, or corporate booking is not
// "something to do". Includes pavilion/park bookings for personal events
// (birthdays, reunions, picnics) which some county feeds publish as events.
const RE_RENTAL =
  /\b(wedding|reception|banquet|reunion)\b|\bprivate\b[^|]*\b(event|party|booking|rental|reservation|corp)\b|\bcorporate (event|party|booking)\b|\bemployee\s+picnic\b|\b(?:facility|pavilion|shelter|room|field|court)\s+(?:reservation|rental|booking)\b|^\s*(?:private\s+)?reservation(?:\s*#?\d+)?\s*$|\bpavilion\b[^|]*\b(birthday|reunion|party|graduation|wedding|shower|anniversary|picnic)\b|\b(birthday|graduation)\s+party\b/i;

// Municipal service / public-works reminders — keep, but in their own lane.
const RE_REMINDER =
  /\bbulk\s*trash\b|\byard\s*waste\b|\bcurbside\b|\bleaf\s*(collection|pickup|removal)\b|\brecycling\b|\b(trash|refuse)\s*(pickup|collection|day)\b|street\s*sweep|\b(road|lane|street)\s*closure\b|snow\s*(emergency|operations|removal)|\bmowing\b/i;

// Administrative notices are useful information, but not somewhere a person
// can go. Office and holiday closures have their own lane below.
const RE_ADMIN_NOTICE = /\b(?:newsletter\s+)?articles?\s+(?:(?:is|are)\s+)?due\s*$/i;

// Closure notices are not events (owner decision, November 11, 2026
// hierarchy audit: "Town Offices Closed" sat under Happening now on Veterans
// Day). Municipal and library calendars publish them as all-day entries, and
// the titles arrive in many shapes: "Town Offices Closed", "Veterans Day -
// Town Offices Closed", "Library Closed for Thanksgiving", "Holiday Closure".
// A title is a closure only when every part of it, split at its separators,
// is either the closure itself, a holiday name, or a date. That is what keeps
// "Office Closed: The Musical" and "Behind Closed Doors" public.
const HOLIDAY =
  "(?:new\\s+year['’]?s?(?:\\s+(?:day|eve))?|(?:dr\\.?\\s+)?martin\\s+luther\\s+king(?:,?\\s+jr\\.?)?(?:['’]s)?(?:\\s+day)?|mlk(?:\\s+day)?|presidents?['’]?\\s+day|washington['’]?s\\s+birthday|good\\s+friday|memorial\\s+day|juneteenth|independence\\s+day|(?:the\\s+)?fourth\\s+of\\s+july|july\\s+4(?:th)?|labor\\s+day|columbus\\s+day|indigenous\\s+peoples?['’]?\\s+day|veterans?['’]?\\s+day|election\\s+day|(?:the\\s+)?day\\s+after\\s+thanksgiving|thanksgiving(?:\\s+day)?|american\\s+indian\\s+heritage\\s+day|christmas(?:\\s+(?:day|eve))?|winter\\s+break)";
const CLOSURE_SUBJECT =
  "(?:(?:(?:town|city|county|municipal|administrative|government)\\s+)?(?:offices?|office\\s+building|town\\s+hall|city\\s+hall|municipal\\s+building)|(?:all\\s+)?(?:(?:library|fcpl)\\s+)?(?:librar(?:y|ies)|branch(?:es)?)|(?:senior|community)\\s+center|(?:all\\s+)?facilities)";
const RE_CLOSURE_SEGMENT = new RegExp(
  `^(?:${HOLIDAY}(?:\\s+holiday)?\\s+)?(?:(?:the|all)\\s+)?${CLOSURE_SUBJECT}\\s+(?:(?:is|are|will\\s+be)\\s+)?(?:closed(?:\\s+(?:for|on|in\\s+observance\\s+of|due\\s+to)\\b.*)?|clos(?:es|ing)\\s+(?:early\\b.*|at\\b.*))$`,
  "i",
);
// A bare "Closed" part needs a holiday beside it or in its own clause, so a
// show called "Closed for Business" stays public.
const RE_BARE_CLOSED = new RegExp(
  `^closed(?:\\s+(?:for|on|in\\s+observance\\s+of)\\s+(?:the\\s+)?(?:${HOLIDAY}|holidays?)(?:\\s+(?:holiday|observed))*)?$`,
  "i",
);
const RE_CLOSURE_WORD = new RegExp(`^(?:${HOLIDAY}\\s+(?:holiday\\s+)?|holiday\\s+)closures?$`, "i");
const RE_HOLIDAY_PART = new RegExp(
  `^(?:${HOLIDAY}(?:\\s+(?:holiday|observed|observance))*|holiday|observed)$`,
  "i",
);
const RE_DATE_PART =
  /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/i;

/** True when a feed title announces a closure rather than an event. Pure. */
export function isClosureNotice(title: string): boolean {
  const parts = (title ?? "")
    .split(/\s+[-\u2013\u2014|]\s+|\s*:\s+|\s*[()[\]]\s*/)
    .map((part) => part.trim().replace(/[.!]+$/, ""))
    .filter(Boolean);
  const isClosurePart = (part: string) =>
    RE_CLOSURE_SEGMENT.test(part) || RE_CLOSURE_WORD.test(part) || RE_BARE_CLOSED.test(part);
  const closureParts = parts.filter(isClosurePart);
  if (closureParts.length === 0) return false;
  // A lone bare "Closed" is not enough. It must sit next to a holiday name.
  if (closureParts.every((part) => /^closed$/i.test(part)) &&
    !parts.some((part) => RE_HOLIDAY_PART.test(part))) {
    return false;
  }
  return parts.every((part) =>
    isClosurePart(part) || RE_HOLIDAY_PART.test(part) || RE_DATE_PART.test(part));
}

// Search/social platforms sometimes expose a profile page as though it were
// an event. Match only the syndicated SEO-title form: an @handle or an
// explicit metadata delimiter immediately before the fixed Instagram suffix.
// A genuine class named "Instagram Photos and Videos Workshop" stays public.
const RE_NON_EVENT =
  /(?:\(@[a-z0-9._]+\)\s*(?:[•·|:-]\s*)?|[•·|]\s*)instagram\s+photos\s+and\s+videos\s*$/i;

// Boards / commissions / hearings / council sessions / internal meetings.
// Broadened from a name allowlist to ANY commission/committee/subcommittee
// (which are overwhelmingly government bodies) + town/virtual meetings, after
// the review found Sustainability/Parks/Rustic-Roads Commissions and a
// "Planning Committee Leadership Luncheon" leaking into public discovery and
// even LEADING it. Still NOT a bare "board"/"council" (would catch
// "Arts Council", "skateboard"); a stray civic item is preferable to a
// festival hidden, but a meeting must never lead "What's on".
// "board meeting" and "board of directors" are added explicitly: an
// external audit (2026-07) found "Loats Board Meeting" and bare "Board
// Meeting" leading public discovery, because the pattern deliberately
// avoids bare "board" (to spare "Arts Council", "skateboard", "board
// game night") and so missed the "<org> Board Meeting" governance form.
// "board meeting"/"board of directors" are unambiguous governance phrases;
// "board" alone stays out. Online-meeting synonyms (zoom/teams/webex)
// join "virtual" for the same reason a "Zoom Meeting" is not an outing.
const RE_MEETING =
  /\badvisory\s+board\b|\bboard\s+of\s+(education|county\s+commissioners|appeals|zoning|elections|health|trustees|directors)\b|\bboard\s+meeting\b|\b(commission|committee|subcommittee)\b|\bpublic\s+hearing\b|\bcouncil\s+(meeting|workshop|work\s*session|legislative|session)\b|\b(city|town)\s+council\b|\bwork\s*session\b|\btown\s+hall\s+meeting\b|\btown\s+meeting\b|\b(?:virtual|online|zoom|teams|webex)\s+meeting\b/i;

const RE_CANCELLED = /\bcancell?ed\b|\bpostponed\b/i;

export function classifyEvent(
  e: { title: string; status?: EventStatus | string; category?: string },
): EventLane {
  const t = e.title ?? "";
  if (e.status === "cancelled" || e.status === "postponed" || RE_CANCELLED.test(t)) {
    return "cancelled";
  }
  if (RE_NON_EVENT.test(t)) return "non_event";
  if (isClosureNotice(t)) return "closure_notice";
  if (RE_RENTAL.test(t)) return "private_rental";
  if (RE_REMINDER.test(t) || RE_ADMIN_NOTICE.test(t)) return "town_reminder";
  if (RE_MEETING.test(t) || e.category === "civic") return "civic_meeting";
  return "public";
}

/** True only for events that may lead the public "What's on" surfaces. */
export function isPublicEvent(
  e: { title: string; status?: EventStatus | string; category?: string } &
    EventAttendanceInput,
): boolean {
  return classifyEvent(e) === "public" && hasActionableAttendance(e);
}
