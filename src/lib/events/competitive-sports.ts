import { eventIntentOf } from "@/lib/events/intents";

type SportsEventCandidate = {
  category?: string;
  title?: string | null;
  description?: string | null;
};

// These are sports-adjacent activities, but they are not games or matches.
// Keep this title-only so an actual game is not rejected merely because its
// description mentions a ticket link or a fundraising partner.
const NON_COMPETITIVE_TITLE =
  /\b(?:board game|tickets?|bible study|camps?|clinics?|classes?|lessons?|workshops?|fundraisers?|fundraising|skills?(?:\s+(?:camp|session|training))?|sports night|watch part(?:y|ies)|tailgates?|tryouts?|registration|open house|open play|pep rally|banquets?|hot dogs?)\b/i;

const COMPETITION_SIGNAL =
  /(?:\bvs\.?(?=\s|$)|\bversus\b|\b(?:games?|matches?|match play|meets?|tournaments?|championships?|playoffs?|semi-?finals?|finals?|series|races?|racing|runs?|running|5k|10k|marathons?|triathlons?|regattas?|bouts?|competitions?|classics?|cups?|scrimmages?|duals?|invitationals?|qualifiers?|intramurals?|leagues?|home openers?)\b)/i;

/**
 * The general Sports intent is deliberately broad. This stricter predicate
 * is for a section that specifically promises games happening in Frederick.
 */
export function isCompetitiveSportsEvent(
  event: SportsEventCandidate,
): boolean {
  if (eventIntentOf(event) !== "sports") return false;

  const title = event.title?.trim() ?? "";
  if (!title || NON_COMPETITIVE_TITLE.test(title)) return false;

  return COMPETITION_SIGNAL.test(
    `${title} ${event.description?.trim() ?? ""}`,
  );
}
