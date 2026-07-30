import { COUNTY_REGION_LABELS, parseCountyRegions, type CountyRegion } from "@/data/county-regions";
import { parseReservationRequest } from "@/lib/ask/reservations";
import { parseAskDateTime } from "@/lib/ask/time";

export type AskIntentKind = "place" | "event" | "plan" | "civic" | "explore";
export type AskTimeNeed = "now" | "today" | "tonight" | "tomorrow" | "weekend" | "morning" | "afternoon" | null;
export type AskAudience = "solo" | "date" | "family" | "friends" | "visitor";
export type AskVibe = "easy" | "active" | "cultural" | "outdoors" | "food";
export type AskDietaryConstraint = "gluten-free" | "vegan" | "vegetarian" | "dairy-free" | "nut-free";

export type AskIntent = {
  kind: AskIntentKind;
  label: string;
  timeNeed: AskTimeNeed;
  audience: AskAudience;
  vibe: AskVibe;
  durationHours: 2 | 3 | 4 | 6;
  travelMode: "walk" | "drive" | null;
  budget: "free" | "value" | null;
  localOnly: boolean;
  surpriseMe: boolean;
  reservation: boolean;
  requestedTime: string | null;
  requestedDate: string | null;
  requestedDateTime: string | null;
  partySize: number | null;
  dietary: AskDietaryConstraint[];
  regions: CountyRegion[];
  constraints: string[];
};

const CIVIC_RE = /\b(report|permit|license|register to vote|trash pickup|pothole|county office|department|phone number|pay (?:a|my)|animal control|zoning|property tax|public records?|courthouse|(?:district|circuit|county) court|sheriff|police|county government|city government)\b/i;
const EVENT_RE = /\b(event|events|concert|festival|live music|performance|happening|calendar)\b/i;
const PLAN_RE = /\b(plan|itinerary|date[-\s]+night|day out|afternoon out|evening out|morning out|perfect (?:hour|morning|afternoon|evening|day)|few hours|make (?:me|us) a day|build (?:me|us) a)\b/i;
const PLACE_RE = /\b(food|eat|eaten|ate|eating|restaurant|pizza|coffee|cafe|breakfast|lunch|dinner|sandwich|beer|brewery|bar|park|trail|shop|store|grocery|pharmacy|drugstore|gas station|fuel station|atm|cash machine|hotel|motel|lodging|place to stay|museum|patio|bike|bikes|bicycle|bicycles|cycling|open|nearby|near me)\b/i;
const PLACE_SEEKING_RE =
  /\b(?:where\s+(?:can|could|should|do)\s+(?:i|we|you)\s+(?:find|get|rent|buy|borrow|visit|go|grab|use|charge|park|pick\s+up)|find\s+me\s+(?:a|an|some))\b/i;
const GENERAL_INFORMATION_RE =
  /\b(?:information|info|instructions?|requirements?|applications?|forms?|websites?|online|rules?|polic(?:y|ies)|laws?|data|statistics?|records?|documents?|budgets?|schedules?)\b/i;
const ACTIVITY_RE = /\b(?:(?:anything|something) fun|things? to do|what (?:should|can|could) (?:i|we) do|anything going on)\b/i;
const ACTIVITY_TIME_RE = /\b(?:today|tonight|this evening|tomorrow|this weekend|next weekend|this morning|this afternoon|(?:(?:this|next)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening|night))?)\b/i;

/** Natural event discovery often omits the noun "event." Keep a dated
 * activity request on the live-calendar path instead of fuzzy-searching
 * "fun" across businesses. */
export function isTimedActivityRequest(query: string): boolean {
  return ACTIVITY_RE.test(query) && ACTIVITY_TIME_RE.test(query);
}

export type FixedAppointmentAnchor = {
  relation: "before" | "after";
  kind: "show" | "concert" | "performance" | "event" | "movie" | "play";
  timeLabel: string | null;
  dateTime: string | null;
};

const FIXED_APPOINTMENT_RE = /\b(before|after)\s+(?:(?:a|an|the|my|our|their|tonight(?:'s)?|tomorrow(?:'s)?)\s+)?(?:(\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)?)\s+)?(shows?|concerts?|performances?|events?|movies?|plays?)\b(?:\s+(?:at\s+)?(\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)))?/i;

const APPOINTMENT_KIND: Record<string, FixedAppointmentAnchor["kind"]> = {
  show: "show",
  shows: "show",
  concert: "concert",
  concerts: "concert",
  performance: "performance",
  performances: "performance",
  event: "event",
  events: "event",
  movie: "movie",
  movies: "movie",
  play: "play",
  plays: "play",
};

/**
 * An event named after "before" or "after" is normally a fixed appointment,
 * not something Radius has been asked to discover. A clock is accepted only
 * when it includes minutes or a meridiem, avoiding "before 3 events" as time.
 */
export function parseFixedAppointmentAnchor(
  query: string,
  now = new Date(),
): FixedAppointmentAnchor | null {
  const match = query.match(FIXED_APPOINTMENT_RE);
  if (!match) return null;
  const rawClock = match[2] ?? match[4] ?? null;
  const safeClock = rawClock && (rawClock.includes(":") || /(?:a|p)\.?m\.?/i.test(rawClock))
    ? rawClock.trim()
    : null;
  const parsed = safeClock ? parseAskDateTime(`${query} at ${safeClock}`, now) : null;
  return {
    relation: match[1].toLowerCase() as FixedAppointmentAnchor["relation"],
    kind: APPOINTMENT_KIND[match[3].toLowerCase()],
    timeLabel: parsed?.timeLabel ?? null,
    dateTime: parsed?.instant?.toISOString() ?? null,
  };
}

function durationFor(q: string): 2 | 3 | 4 | 6 {
  const match = q.match(/\b(\d+(?:\.5)?)\s*(?:hour|hr)s?\b/i);
  const stated = match ? Number(match[1]) : NaN;
  if (Number.isFinite(stated)) {
    if (stated >= 5) return 6;
    if (stated >= 3.5) return 4;
    if (stated >= 2.5) return 3;
    return 2;
  }
  if (/\b(all day|half day|day trip)\b/i.test(q)) return 6;
  if (/\b(few hours|afternoon|evening|date[-\s]+night)\b/i.test(q)) return 3;
  return 2;
}

function labelFor(kind: AskIntentKind, q: string): string {
  if (kind === "plan") return "Build a real plan";
  if (kind === "civic") return "Official local help";
  if (kind === "event") return /tonight/i.test(q) ? "What is on tonight" : "Current events";
  if (/breakfast sandwich|egg sandwich|bagel sandwich/i.test(q)) return "Breakfast sandwich";
  if (/\bsteak(?:house)?\b/i.test(q)) return "Steak dinner";
  if (/coffee|cafe/i.test(q)) return "Coffee";
  if (/\b(?:pharmacy|drugstore)\b/i.test(q)) return "Pharmacies";
  if (/\b(?:gas station|fuel station)\b/i.test(q)) return "Gas stations";
  if (/\b(?:atm|cash machine)\b/i.test(q)) return "ATMs";
  if (/\bbreakfast\b/i.test(q)) return "Breakfast";
  if (/\blunch\b/i.test(q)) return "Lunch";
  if (/\bdinner\b/i.test(q)) return "Dinner";
  if (/restaurant|food/i.test(q)) return "Food nearby";
  if (kind === "place") return "Best local matches";
  return "Explore Frederick";
}

/**
 * Fast, deterministic intent parsing for the decisions Radius can prove from
 * its own data. The model is deliberately not in this loop: location, time,
 * budget, and itinerary constraints should behave the same on every request.
 */
export function parseAskIntent(query: string, now = new Date()): AskIntent {
  const q = query.trim();
  const fixedAppointment = parseFixedAppointmentAnchor(q, now);
  const explicitPlaceList = (
    /\b(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[a-z'-]+\s+){0,3}(?:restaurants?|places?|spots?|breweries?|cafes?|shops?)\b/i.test(q) &&
    !/\b(?:plan|itinerary|route|then|followed by|compare)\b/i.test(q)
  );
  const compoundPlan = (
    !fixedAppointment &&
    /\b(?:dinner|food|restaurant|drinks?)\b/i.test(q) &&
    /\b(?:show|concert|live music|event|performance)\b/i.test(q) &&
    /\b(?:and|then|plus|followed by|before|after)\b/i.test(q)
  );
  const plan = (PLAN_RE.test(q) && !explicitPlaceList) || compoundPlan;
  const civic = CIVIC_RE.test(q);
  const event = (EVENT_RE.test(q) || isTimedActivityRequest(q)) &&
    !(fixedAppointment && PLACE_RE.test(q));
  const place =
    PLACE_RE.test(q) ||
    (PLACE_SEEKING_RE.test(q) && !GENERAL_INFORMATION_RE.test(q));
  const kind: AskIntentKind = civic
    ? "civic"
    : plan
      ? "plan"
      : event
        ? "event"
        : place || explicitPlaceList
          ? "place"
          : "explore";

  const timeNeed: AskTimeNeed = /\b(right now|open now|now)\b/i.test(q)
    ? "now"
    // "Date night" and "an evening out" describe the outing, not the date.
    // Only explicit current-evening language should pin the plan to tonight.
    : /\b(tonight|this evening)\b/i.test(q)
      ? "tonight"
      : /\btomorrow\b/i.test(q)
        ? "tomorrow"
      : /\b(this )?weekend\b/i.test(q)
        ? "weekend"
      : /\b(this )?morning\b/i.test(q)
          ? "morning"
          : /\b(this )?afternoon\b/i.test(q)
            ? "afternoon"
          : /\btoday\b/i.test(q)
            ? "today"
            : null;

  const reducedMobility = /\b(?:less walking|minimal walking|can(?:not|'t) walk|limited mobility|mobility issues?|wheelchair|walker|easy parking|close parking)\b/i.test(q);
  const audience: AskAudience = /\b(date|romantic|anniversary|partner)\b/i.test(q)
    ? "date"
    : /\b(kids?|children|family|toddler)\b/i.test(q)
      ? "family"
      : /\b(friends?|group|crew)\b/i.test(q)
        ? "friends"
        : /\b(visitor|visiting|first time|out of town|parents?|seniors?|older adults?)\b/i.test(q)
          ? "visitor"
          : "solo";

  const vibe: AskVibe = /\b(hike|trail|outside|outdoor|park|nature)\b/i.test(q)
    ? "outdoors"
    : /\b(active|workout|bike|bicycle|cycling|run|adventure)\b/i.test(q)
      ? "active"
      : /\b(art|history|museum|gallery|culture|theater|theatre)\b/i.test(q)
        ? "cultural"
        : /\b(food|eat|eaten|ate|eating|restaurant|breakfast|lunch|dinner|coffee|beer|drink|date[-\s]+night)\b/i.test(q)
          ? "food"
          : "easy";

  // Negative walking language must win over the bare word "walking". Without
  // this guard, "less walking for my parents" became a walking itinerary.
  const travelMode = reducedMobility
    ? "drive" as const
    : /\b(walk|walking|walkable|on foot)\b/i.test(q)
    ? "walk" as const
    : /\b(drive|driving|car)\b/i.test(q)
      ? "drive" as const
      : null;
  const dietary = [
    /\bgluten[- ]free\b/i.test(q) ? "gluten-free" as const : null,
    /\bvegan\b/i.test(q) ? "vegan" as const : null,
    /\bvegetarian\b/i.test(q) ? "vegetarian" as const : null,
    /\bdairy[- ]free\b|\blactose[- ]free\b/i.test(q) ? "dairy-free" as const : null,
    /\bnut[- ]free\b|\bpeanut[- ]free\b/i.test(q) ? "nut-free" as const : null,
  ].filter((value): value is AskDietaryConstraint => value != null);
  const asksFreeAdmission = /\b(?:free admission|free entry|no cost|costs? nothing|for free|free to (?:attend|enter|visit))\b/i.test(q) ||
    (/\bfree\b/i.test(q) && dietary.length === 0);
  const budget = asksFreeAdmission
    ? "free" as const
    : /\b(cheap|inexpensive|budget|affordable|under \$?\d+)\b/i.test(q)
      ? "value" as const
      : null;
  const localOnly = /\b(local only|locally owned|independent|no chains?|skip chains?)\b/i.test(q);
  const surpriseMe = /\b(surprise me|dealers? choice|pick for me|anything|something fun)\b/i.test(q);
  const reservation = parseReservationRequest(q, now);
  const dateTime = parseAskDateTime(q, now);
  const regions = parseCountyRegions(q);
  const durationHours = durationFor(q);

  const constraints = [
    timeNeed === "now" ? "Open now" : timeNeed === "tonight" ? "Tonight" : timeNeed === "tomorrow" ? "Tomorrow" : timeNeed === "weekend" ? "This weekend" : timeNeed === "morning" ? "Morning" : timeNeed === "afternoon" ? "Afternoon" : timeNeed === "today" ? "Today" : null,
    travelMode === "walk" ? "Walking" : travelMode === "drive" ? "Driving" : null,
    audience === "date" ? "Date" : audience === "family" ? "Family" : audience === "friends" ? "Friends" : audience === "visitor" ? "Visitor" : null,
    budget === "free" ? "Free" : budget === "value" ? "Good value" : null,
    localOnly ? "Independent spots" : null,
    ...dietary.map((item) => item === "gluten-free" ? "Gluten-free" : item === "dairy-free" ? "Dairy-free" : item === "nut-free" ? "Nut-free" : item[0].toUpperCase() + item.slice(1)),
    kind === "plan" ? `${durationHours} hours` : null,
    surpriseMe ? "Surprise me" : null,
    reservation.requested ? "Reservation" : null,
    reservation.timeLabel,
    dateTime.explicitDate && !timeNeed ? dateTime.dateLabel : null,
    ...regions.map((region) => COUNTY_REGION_LABELS[region]),
  ].filter((value): value is string => Boolean(value));

  return {
    kind,
    label: labelFor(kind, q),
    timeNeed,
    audience,
    vibe,
    durationHours,
    travelMode,
    budget,
    localOnly,
    surpriseMe,
    reservation: reservation.requested,
    requestedTime: reservation.timeLabel,
    requestedDate: reservation.dateKey ?? dateTime.dateKey,
    requestedDateTime: reservation.dateTime ?? dateTime.instant?.toISOString() ?? null,
    partySize: reservation.partySize,
    dietary,
    regions,
    constraints,
  };
}
