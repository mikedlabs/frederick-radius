/**
 * The needs corpus — what people around here actually ask for.
 *
 * Organized by the North Star's two axes (tenure × decision state) plus the
 * topic personas the 2026-07-30 audit found weakest. Every need is a real,
 * recurring Frederick County question, and every expectation is checkable
 * against the shipped stack. See `coverage.ts` for how verdicts are computed.
 *
 * Rules for adding a need:
 *  - Phrase it the way a person types it, not the way the catalog files it.
 *    That mismatch is the whole point of the measurement.
 *  - The expectation must be satisfiable by data that exists. If it is not,
 *    mark `knownGap` with what is missing so it reports as a data hole rather
 *    than pretending the ranking is broken.
 *  - Prefer the narrowest honest expectation. "Any restaurant satisfies
 *    'kid friendly restaurant'" flattered the original audit's headline; a
 *    loose expectation that cannot fail measures nothing.
 */

import type { CoverageNeed } from "./coverage";

export const COVERAGE_CORPUS: readonly CoverageNeed[] = [
  // ── Resident · Decided ────────────────────────────────────────────────
  // The retention engine. These are the buried answers people keep the app
  // for, so a WEAK here is a product failure even though results exist.
  {
    persona: "Resident · decided",
    need: "pharmacy",
    expect: { kind: "place", categories: ["pharmacy"] },
    phrasings: ["bare", "nearMe", "closest"],
  },
  {
    persona: "Resident · decided",
    need: "prescription",
    expect: { kind: "place", categories: ["pharmacy"] },
    phrasings: ["bare", "whereCanI"],
  },
  {
    persona: "Resident · decided",
    need: "urgent care",
    expect: { kind: "place", categories: ["wellness"] },
    phrasings: ["bare", "nearMe", "closest"],
  },
  {
    persona: "Resident · decided",
    need: "post office",
    expect: { kind: "place", categories: ["services", "civic", "government"] },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Resident · decided",
    need: "library",
    expect: { kind: "place", categories: ["library"] },
    phrasings: ["bare", "nearMe", "closest"],
  },
  {
    persona: "Resident · decided",
    need: "grocery store",
    expect: { kind: "place", categories: ["market", "shopping"] },
    phrasings: ["bare", "nearMe", "closest"],
  },
  {
    persona: "Resident · decided",
    need: "hardware store",
    expect: { kind: "place", categories: ["shopping", "services"] },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Resident · decided",
    need: "oil change",
    expect: { kind: "place", categories: ["auto-care", "services"] },
    phrasings: ["bare", "whereCanI"],
  },

  // ── Resident · decided · buried civic (the moat) ──────────────────────
  // These must reach an official answer: a department card or the county's
  // own How-Do-I action. A ranked place row is the wrong shape of answer.
  {
    persona: "Buried civic",
    need: "trash pickup schedule",
    // Narrowed 2026-09-22: the old pattern passed on ANY frederick .gov URL,
    // so it scored PASS while the app actually routed to the "report a missed
    // collection" page. Require the real schedule resource.
    expect: { kind: "href", pattern: /curbside|collection-schedule|3447/i },
    phrasings: ["bare", "whereIs"],
  },
  {
    persona: "Buried civic",
    need: "animal control",
    expect: { kind: "href", pattern: /gov|animal/i },
    phrasings: ["bare", "iNeed"],
  },
  {
    persona: "Buried civic",
    need: "report a pothole",
    expect: { kind: "href", pattern: /gov|fixit|report/i },
    phrasings: ["bare"],
  },
  {
    persona: "Buried civic",
    need: "building permit",
    expect: { kind: "href", pattern: /gov|permit/i },
    phrasings: ["bare", "whereCanI"],
  },
  {
    persona: "Buried civic",
    need: "property tax bill",
    expect: { kind: "href", pattern: /gov|tax|treasur/i },
    phrasings: ["bare"],
  },
  {
    persona: "Buried civic",
    need: "voter registration",
    expect: { kind: "href", pattern: /gov|vot|election|board-?of-?elections/i },
    phrasings: ["bare", "whereCanI"],
  },
  {
    // The audit's headline civic miss: "dmv" and "drivers license" dead-ended
    // because only the literal "mva" matched. Guard all three phrasings.
    persona: "Buried civic",
    need: "dmv",
    expect: { kind: "href", pattern: /mva|mdot|gov/i },
    phrasings: ["bare"],
  },
  {
    persona: "Buried civic",
    need: "drivers license",
    expect: { kind: "href", pattern: /mva|mdot|gov/i },
    phrasings: ["bare", "whereCanI"],
  },

  // ── Resident · Undecided ──────────────────────────────────────────────
  // The anticipatory layer. The right answer is a surface with a point of
  // view, not a single row.
  {
    persona: "Resident · undecided",
    need: "what's open now",
    // The shipped answer is the map's open-now browse view (`?open=now`), so
    // the pattern has to admit the query-param form, not just the /open-now
    // route.
    expect: { kind: "href", pattern: /open[-=]?now|nearby|\/today/i },
    phrasings: ["bare"],
  },
  {
    persona: "Resident · undecided",
    need: "events tonight",
    expect: { kind: "href", pattern: /events|today/i },
    phrasings: ["bare"],
  },
  {
    persona: "Resident · undecided",
    need: "live music",
    expect: { kind: "href", pattern: /live-?music|events|music/i },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Resident · undecided",
    need: "happy hour",
    expect: { kind: "href", pattern: /happy-?hour|deals/i },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Resident · undecided",
    need: "farmers market",
    expect: { kind: "href", pattern: /market|farmers/i },
    phrasings: ["bare", "nearMe"],
  },

  // ── Visitor · Decided ─────────────────────────────────────────────────
  // Low patience, one hand, on cellular. Wayfinding utilities.
  {
    persona: "Visitor · decided",
    need: "parking",
    expect: { kind: "href", pattern: /parking|map/i },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Visitor · decided",
    need: "public restroom",
    expect: { kind: "href", pattern: /restroom|map/i },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Visitor · decided",
    need: "coffee",
    expect: { kind: "place", categories: ["coffee", "bakery"] },
    phrasings: ["bare", "nearMe", "closest"],
  },
  {
    persona: "Visitor · decided",
    need: "hotel",
    expect: { kind: "place", categories: ["lodging"] },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Visitor · decided",
    need: "atm",
    expect: { kind: "href", pattern: /atm|map|bank|services/i },
    phrasings: ["bare", "nearMe"],
  },

  // ── Visitor · Undecided (the acquisition moment) ──────────────────────
  {
    persona: "Visitor · undecided",
    need: "brewery",
    expect: { kind: "place", categories: ["brewery"] },
    phrasings: ["bare", "nearMe", "best"],
  },
  {
    persona: "Visitor · undecided",
    need: "winery",
    expect: { kind: "place", categories: ["winery", "agritourism"] },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Visitor · undecided",
    need: "museum",
    expect: { kind: "place", categories: ["museum", "gallery"] },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Visitor · undecided",
    need: "hiking trail",
    expect: { kind: "place", categories: ["trail", "park"] },
    phrasings: ["bare", "nearMe", "best"],
  },
  {
    persona: "Visitor · undecided",
    need: "antique shopping",
    expect: { kind: "place", categories: ["antiques", "shopping"] },
    phrasings: ["bare"],
  },

  // ── Faith — the audit's worst persona before synonyms (39% → 96%) ─────
  {
    persona: "Faith",
    need: "church",
    expect: { kind: "place", categories: ["worship"] },
    phrasings: ["bare", "nearMe", "closest"],
  },
  {
    persona: "Faith",
    need: "sunday service",
    expect: { kind: "place", categories: ["worship"] },
    phrasings: ["bare", "whereCanI"],
  },
  {
    persona: "Faith",
    need: "synagogue",
    expect: { kind: "place", categories: ["worship"] },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Faith",
    need: "mosque",
    expect: { kind: "place", categories: ["worship"] },
    phrasings: ["bare", "nearMe"],
  },

  // ── Family ────────────────────────────────────────────────────────────
  {
    persona: "Family",
    need: "playground",
    expect: { kind: "place", categories: ["playground", "park"] },
    phrasings: ["bare", "nearMe", "closest"],
  },
  {
    persona: "Family",
    need: "ice cream",
    expect: { kind: "place", categories: ["ice-cream"] },
    phrasings: ["bare", "nearMe", "closest"],
  },
  {
    persona: "Family",
    need: "something to do with kids",
    expect: { kind: "href", pattern: /family|kids|today|collections|events/i },
    phrasings: ["bare"],
  },
  {
    persona: "Family",
    need: "indoor rainy day",
    expect: { kind: "href", pattern: /family|indoor|museum|collections|today|library/i },
    phrasings: ["bare"],
  },

  // ── Foodie ────────────────────────────────────────────────────────────
  {
    persona: "Foodie",
    need: "pizza",
    expect: { kind: "place", categories: ["pizza", "restaurant"] },
    phrasings: ["bare", "nearMe", "best"],
  },
  {
    persona: "Foodie",
    need: "bakery",
    expect: { kind: "place", categories: ["bakery"] },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Foodie",
    need: "brunch",
    expect: { kind: "href", pattern: /brunch|restaurant/i },
    phrasings: ["bare", "nearMe"],
  },
  {
    persona: "Foodie",
    need: "tacos",
    expect: { kind: "place", categories: ["restaurant"] },
    phrasings: ["bare", "nearMe"],
  },
  {
    // The audit's fuzzy-match failure: "barbecue" returned three barber shops.
    // Any barber lead here is a regression of the length-ratio floor.
    persona: "Foodie",
    need: "barbecue",
    expect: { kind: "place", categories: ["restaurant"] },
    phrasings: ["bare", "nearMe"],
  },

  // ── Outdoors ──────────────────────────────────────────────────────────
  {
    persona: "Outdoors",
    need: "park",
    expect: { kind: "place", categories: ["park", "playground", "trail"] },
    phrasings: ["bare", "nearMe", "closest"],
  },
  {
    persona: "Outdoors",
    need: "dog park",
    expect: { kind: "place", categories: ["park", "playground"] },
    phrasings: ["bare", "nearMe"],
  },
  {
    // The other fuzzy failure: "kayaking" returned King's Pizza and Burger
    // King. A restaurant lead here means the length-ratio floor regressed.
    persona: "Outdoors",
    need: "kayaking",
    expect: { kind: "href", pattern: /park|trail|water|river|map|collections|outdoor/i },
    phrasings: ["bare"],
  },
  {
    persona: "Outdoors",
    need: "golf course",
    expect: { kind: "place", categories: ["golf"] },
    phrasings: ["bare", "nearMe"],
  },

  // ── Newcomer — town wayfinding ────────────────────────────────────────
  {
    persona: "Newcomer",
    need: "thurmont",
    expect: { kind: "href", pattern: /\/m\/thurmont/i },
    phrasings: ["bare"],
  },
  {
    persona: "Newcomer",
    need: "brunswick",
    expect: { kind: "href", pattern: /\/m\/brunswick/i },
    phrasings: ["bare"],
  },
  {
    // Typo tolerance that must survive: thurmount → Thurmont is a 0.89 length
    // ratio, comfortably above the 0.6 floor.
    persona: "Newcomer",
    need: "thurmount",
    expect: { kind: "href", pattern: /\/m\/thurmont/i },
    phrasings: ["bare"],
  },
];
