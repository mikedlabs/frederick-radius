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
// Day). Municipal, county and library calendars publish them as all-day
// entries, and the titles arrive in many shapes: "Town Offices Closed",
// "Veterans Day - Town Offices Closed", "Centers are Closed for Thanksgiving
// Day", "Thurmont Regional Library Closed", "Offices Closed: Inclement
// Weather", "Holiday Closure - Libraries".
//
// A title is a closure only when it is built entirely from these pieces:
// a closure verb, an optional facility subject (optionally led by a town,
// branch or "FCPL" name), optional reasons (holidays, weather, staff days),
// optional dates or times, and joiners (-, :, (), /, &, "for", "and", "is").
// Any other word makes the title public. That is what keeps "Office Closed:
// The Musical", "Closed Loop Recycling Workshop", "Closing Reception" and
// "Library Closed Stacks Tour" public. A title with no facility subject also
// needs a reason, so "Closed" and "Closed for Business" stay public too.
const HOLIDAY =
  "(?:new\\s+year(?:'s|s)?(?:\\s+(?:day|eve))?|(?:dr\\.?\\s+)?martin\\s+luther\\s+king(?:,?\\s+jr\\.?)?(?:'s)?(?:\\s+day)?|mlk(?:\\s+day)?|president(?:s|'s|s')?\\s+day|washington'?s\\s+birthday|good\\s+friday|easter(?:\\s+(?:sunday|monday))?|memorial\\s+day|juneteenth|independence\\s+day|(?:the\\s+)?fourth\\s+of\\s+july|july\\s+4(?:th)?|labor\\s+day|columbus\\s+day|indigenous\\s+people(?:s|'s|s')?\\s+day|veteran(?:s|'s|s')?\\s+day|election\\s+day|(?:the\\s+)?day\\s+after\\s+thanksgiving|thanksgiving(?:\\s+day)?|american\\s+indian\\s+heritage\\s+day|christmas(?:\\s+(?:day|eve))?|(?:winter|spring)\\s+break|holidays?|observed|observance)";
// Places that lead a facility name: the county's towns and library branches.
const CLOSURE_PLACE =
  "(?:the|all|fcpl|frederick(?:\\s+county)?|brunswick|burkittsville|emmitsburg|middletown|mount\\s+airy|mt\\.?\\s+airy|myersville|new\\s+market|rosemont|thurmont|walkersville|woodsboro|urbana|point\\s+of\\s+rocks|c\\.?\\s*burr\\s+artz)";
const CLOSURE_FACILITY_MODIFIER =
  "(?:town|city|county|municipal|administrative|government|regional|public|senior|community|recreation)";
const CLOSURE_FACILITY =
  "(?:offices?|office\\s+buildings?|halls?|municipal\\s+buildings?|librar(?:y|ies)|branch(?:es)?|cent(?:er|re)s?|facilities|fcpl)";
const CLOSURE_SUBJECT =
  `(?:${CLOSURE_PLACE}\\s+)*(?:${CLOSURE_FACILITY_MODIFIER}\\s+)*${CLOSURE_FACILITY}`;
// "Closing" alone is not a closure verb ("Closing Reception").
const CLOSURE_VERB = "(?:closed(?:\\s+early)?|closures?|clos(?:e|es|ing)\\s+early|clos(?:es|ing)\\s+at)";
const CLOSURE_WEATHER =
  "(?:(?:inclement|severe|winter|bad)\\s+)?weather(?:\\s+conditions)?|snow(?:\\s+(?:and|&)\\s+ice)?(?:\\s+day)?|ice|winter\\s+storm|power\\s+outage";
const CLOSURE_STAFF_DAY =
  "staff\\s+(?:development|training|in-?service|meeting)(?:\\s+day)?|(?:professional\\s+development|in-?service|training)(?:\\s+day)?";
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const DAY_NUMBER = "\\d{1,2}(?:st|nd|rd|th)?";
const CLOSURE_DATE = [
  `${MONTH}\\s+${DAY_NUMBER}(?:\\s*[-\u2013]\\s*${DAY_NUMBER})?(?:,?\\s+\\d{4})?`,
  "\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?(?:\\s*[-\u2013]\\s*\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)?",
  "\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)|noon",
  "(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?s?",
  "\\d{4}",
  DAY_NUMBER,
].join("|");
const CLOSURE_JOINER_WORD = "and|for|on|in\\s+observance\\s+of|due\\s+to|is|are|will\\s+be|the";

type ClosureTokenKind = "subject" | "verb" | "reason" | "date" | "joiner";
// A word token must end at a word boundary, so "closed" never matches the
// front of "closedown" and "ice" never matches the front of "ice cream".
const closureWord = (source: string) => new RegExp(`(?:${source})(?![a-z0-9'])`, "iy");
// Tried in order at each position; the subject comes before the joiners so
// "The Library" reads as one subject rather than "the" plus a stray word.
const CLOSURE_TOKENS: ReadonlyArray<readonly [ClosureTokenKind, RegExp]> = [
  ["subject", closureWord(CLOSURE_SUBJECT)],
  ["verb", closureWord(CLOSURE_VERB)],
  ["reason", closureWord(HOLIDAY)],
  ["reason", closureWord(CLOSURE_WEATHER)],
  ["reason", closureWord(CLOSURE_STAFF_DAY)],
  ["date", closureWord(CLOSURE_DATE)],
  ["joiner", closureWord(CLOSURE_JOINER_WORD)],
  ["joiner", /[-\u2013\u2014|:()[\]/&,+]/y],
];
const RE_CLOSURE_SPACE = /\s+/y;

/** The token kinds a title is built from, or null when any word is not part of a closure notice. */
function closureTokenKinds(title: string): ClosureTokenKind[] | null {
  const text = (title ?? "").replace(/[\u2018\u2019]/g, "'").trim().replace(/[.!]+$/, "");
  const kinds: ClosureTokenKind[] = [];
  let at = 0;
  while (at < text.length) {
    RE_CLOSURE_SPACE.lastIndex = at;
    const space = RE_CLOSURE_SPACE.exec(text);
    if (space) {
      at += space[0].length;
      continue;
    }
    let matched = false;
    for (const [kind, pattern] of CLOSURE_TOKENS) {
      pattern.lastIndex = at;
      const token = pattern.exec(text);
      if (token && token[0].length > 0) {
        kinds.push(kind);
        at += token[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }
  return kinds;
}

/** True when a feed title announces a closure rather than an event. Pure. */
export function isClosureNotice(title: string): boolean {
  const kinds = closureTokenKinds(title);
  if (!kinds || !kinds.includes("verb")) return false;
  return kinds.includes("subject") || kinds.includes("reason");
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
