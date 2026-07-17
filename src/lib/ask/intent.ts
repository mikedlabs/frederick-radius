import { COUNTY_REGION_LABELS, parseCountyRegions, type CountyRegion } from "@/data/county-regions";
import { parseReservationRequest } from "@/lib/ask/reservations";

export type AskIntentKind = "place" | "event" | "plan" | "civic" | "explore";
export type AskTimeNeed = "now" | "today" | "tonight" | "weekend" | "morning" | "afternoon" | null;
export type AskAudience = "solo" | "date" | "family" | "friends" | "visitor";
export type AskVibe = "easy" | "active" | "cultural" | "outdoors" | "food";

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
  regions: CountyRegion[];
  constraints: string[];
};

const CIVIC_RE = /\b(report|permit|license|register to vote|trash pickup|pothole|county office|department|phone number|pay (?:a|my)|animal control)\b/i;
const EVENT_RE = /\b(event|events|concert|festival|live music|performance|happening|calendar)\b/i;
const PLAN_RE = /\b(plan|itinerary|date night|day out|afternoon out|evening out|morning out|perfect (?:hour|morning|afternoon|evening|day)|few hours|make (?:me|us) a day|build (?:me|us) a)\b/i;
const PLACE_RE = /\b(where|food|eat|eaten|ate|eating|restaurant|pizza|coffee|cafe|breakfast|lunch|dinner|sandwich|beer|brewery|bar|park|trail|shop|store|grocery|hotel|motel|lodging|place to stay|museum|patio|open|nearby|near me)\b/i;

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
  if (/\b(few hours|afternoon|evening|date night)\b/i.test(q)) return 3;
  return 2;
}

function labelFor(kind: AskIntentKind, q: string): string {
  if (kind === "plan") return "Build a real plan";
  if (kind === "civic") return "Official local help";
  if (kind === "event") return /tonight/i.test(q) ? "What is on tonight" : "Current events";
  if (/breakfast sandwich|egg sandwich|bagel sandwich/i.test(q)) return "Breakfast sandwich";
  if (/\bsteak(?:house)?\b/i.test(q)) return "Steak dinner";
  if (/coffee|cafe/i.test(q)) return "Coffee";
  if (/restaurant|dinner|lunch|breakfast|food/i.test(q)) return "Food nearby";
  if (kind === "place") return "Best local matches";
  return "Explore Frederick";
}

/**
 * Fast, deterministic intent parsing for the decisions Radius can prove from
 * its own data. The model is deliberately not in this loop: location, time,
 * budget, and itinerary constraints should behave the same on every request.
 */
export function parseAskIntent(query: string): AskIntent {
  const q = query.trim();
  const plan = PLAN_RE.test(q);
  const civic = CIVIC_RE.test(q);
  const event = EVENT_RE.test(q);
  const kind: AskIntentKind = civic
    ? "civic"
    : plan
      ? "plan"
      : event
        ? "event"
        : PLACE_RE.test(q)
          ? "place"
          : "explore";

  const timeNeed: AskTimeNeed = /\b(right now|open now|now)\b/i.test(q)
    ? "now"
    // "Date night" and "an evening out" describe the outing, not the date.
    // Only explicit current-evening language should pin the plan to tonight.
    : /\b(tonight|this evening)\b/i.test(q)
      ? "tonight"
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
    : /\b(active|workout|bike|run|adventure)\b/i.test(q)
      ? "active"
      : /\b(art|history|museum|gallery|culture|theater|theatre)\b/i.test(q)
        ? "cultural"
        : /\b(food|eat|eaten|ate|eating|restaurant|breakfast|lunch|dinner|coffee|beer|drink|date night)\b/i.test(q)
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
  const budget = /\b(free|no cost|costs? nothing)\b/i.test(q)
    ? "free" as const
    : /\b(cheap|inexpensive|budget|affordable|under \$?\d+)\b/i.test(q)
      ? "value" as const
      : null;
  const localOnly = /\b(local only|locally owned|independent|no chains?|skip chains?)\b/i.test(q);
  const surpriseMe = /\b(surprise me|dealers? choice|pick for me|anything|something fun)\b/i.test(q);
  const reservation = parseReservationRequest(q);
  const regions = parseCountyRegions(q);
  const durationHours = durationFor(q);

  const constraints = [
    timeNeed === "now" ? "Open now" : timeNeed === "tonight" ? "Tonight" : timeNeed === "weekend" ? "This weekend" : timeNeed === "morning" ? "Morning" : timeNeed === "afternoon" ? "Afternoon" : timeNeed === "today" ? "Today" : null,
    travelMode === "walk" ? "Walking" : travelMode === "drive" ? "Driving" : null,
    audience === "date" ? "Date" : audience === "family" ? "Family" : audience === "friends" ? "Friends" : audience === "visitor" ? "Visitor" : null,
    budget === "free" ? "Free" : budget === "value" ? "Good value" : null,
    localOnly ? "Local only" : null,
    kind === "plan" ? `${durationHours} hours` : null,
    surpriseMe ? "Surprise me" : null,
    reservation.requested ? "Reservation" : null,
    reservation.timeLabel,
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
    regions,
    constraints,
  };
}
