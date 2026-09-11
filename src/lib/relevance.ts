/**
 * Discovery relevance — hide the businesses nobody opens a civic
 * "what's around me" app to find.
 *
 * The DFP scrape pulled in a long tail of B2B, professional-services,
 * trades, and residential records: general contractors, insurance
 * agencies, consultancies, law and accounting offices, realty, freight
 * brokers, apartment complexes. None of these are destinations a
 * resident or visitor browses a map or a Radius for — they're noise
 * that makes the product feel like a phone book. Google's authoritative
 * primaryType lets us recognize and quiet them.
 *
 * CONSERVATIVE BY DESIGN — two independent guards must BOTH agree
 * before anything is hidden (the guards are composed in the loader):
 *   1. Google's primaryType is one of the explicit non-discoverable
 *      types below. A vague type ("service", "store", "premise") or no
 *      type at all is NEVER hidden — same null-on-vague rule as the
 *      category corrector. We never trade a real place for a guess.
 *   2. The record is DFP-scraped (source === "dfp"). Curated seed /
 *      manual / GIS content is always shown, so a bad Google text-match
 *      onto a curated venue can never erase it.
 *
 * Reversible by design: the loader gates this on RADIUS_RELEVANCE and
 * admin/audit surfaces read the raw set, so nothing is ever destroyed —
 * only hidden from discovery. Pure + unit-tested.
 */

// Google Places API (New) primaryTypes that are not discovery
// destinations. Grouped by why they don't belong on a "what's around"
// surface. Counts in comments are from the 2026-05 enrichment so the
// scope of each entry is legible.
export const NON_DISCOVERABLE_TYPES: ReadonlySet<string> = new Set([
  // Professional services — appointment/office, not a walk-in place
  "consultant", // 83
  "lawyer", // 53
  "insurance_agency", // 36
  "finance", // 32
  "accounting", // 3
  "real_estate_agency", // 26
  "marketing_consultant", // 2
  "employment_agency", // 2
  "corporate_office", // 2
  "business_center", // 1

  // Trades / service-call — you phone them, you don't visit
  "general_contractor", // 27
  "roofing_contractor", // 3
  "electrician", // 1
  "plumber", // 1
  "painter", // 2
  "locksmith", // 3
  "moving_company", // 1

  // B2B / logistics — not consumer-facing. NOTE: "manufacturer" is
  // deliberately NOT here — Google types distilleries, breweries,
  // roasters, and makers as "manufacturer" (McClintock, Tenth Ward,
  // True Standard …), and those are exactly the destinations this app
  // exists to surface. Hiding them would be the cardinal sin.
  "wholesaler", // 1
  "supplier", // 4
  "shipping_service", // 1
  "courier_service", // 1
  "transportation_service", // 3
  "telecommunications_service_provider", // 1

  // Residential — a home, not a point of interest
  "apartment_complex", // 8
  "apartment_building", // 5
  "condominium_complex", // 3

  // Bare "service" — Google's catch-all type for appointment-only
  // providers (cleaning, IT, repair-by-call). 156 in our dataset; the
  // small share that ARE destinations (a body shop you walk into) get
  // a more specific primaryType. Adding this hides ~129 DFP-scraped
  // shopping-labeled service providers from discovery (2026-05-20).
  "service",

  // B2B-only types that slipped through the original audit (2026-05-20).
  "manufacturer_representative",
  "engineer",
  "architecture_firm",
  "advertising_agency",
  "tax_preparation_service",
  "investment_advisor",
  "financial_planner",
]);

/**
 * True when Google's primaryType says this is not a discovery
 * destination (B2B / trade / professional-services / residential).
 * Vague or absent types return false — keep, never guess away a place.
 */
export function isNonDiscoverable(
  primaryType: string | undefined | null,
): boolean {
  if (!primaryType) return false;
  return NON_DISCOVERABLE_TYPES.has(primaryType.trim().toLowerCase());
}

/**
 * RECOMMENDATION eligibility — the editorial-strictness layer.
 *
 * A school, preschool, university, or daycare is a real place that
 * belongs in Search, Map, Saved, and its own detail page — but it is NOT
 * "a thing to do." The product's judgment leak was treating "belongs to a
 * category" as "should be recommended": e.g. Family's "Worth your time"
 * led with an elementary school and a college admissions office. This
 * predicate gates RECOMMENDATION surfaces only (Best matches / Worth your
 * time / curated picks / Today best moves), never browse/search/map/saved/
 * detail — so institutions stay findable, just not promoted.
 *
 * Deterministic + universal (one type-set, every category inherits it).
 * Pure, unit-tested.
 */
/** Hand-curated provenance. Everything else (dfp, google, discovered, and
 *  any bulk source added later) is subject to the institution deny. */
export const CURATED_SOURCES: ReadonlySet<string> = new Set(["seed", "manual"]);

export const RECOMMENDATION_DENY_TYPES: ReadonlySet<string> = new Set([
  "primary_school",
  "secondary_school",
  "high_school",
  "school",
  "preschool",
  "university",
  "college",
  "child_care_agency",
]);

/**
 * Tiny GLOBAL rescue list — real destinations Google mis-typed as a
 * school/university. The deterministic deny is blunt: Google labels
 * Delaplaine Fine Arts Center, the Volpe Athletic Center, BBT Arena, and
 * the Master Gardener gardens as "university". These are exactly the
 * venues the app exists to surface, so they are explicitly recommendable.
 *
 * KEEP THIS SMALL. If it grows past a handful, that's a signal we need a
 * better upstream classification field — not a giant manual patch table.
 */
export const RECOMMEND_ALLOW_SLUGS: ReadonlySet<string> = new Set([
  "delaplaine-fine-arts-center-emmitsburg",
  "ronald-j-volpe-athletic-center",
  "bbt-arena",
  "frederick-county-master-gardeners-demonstration-gardens-frederick",
]);

/**
 * Private membership organizations can still have a public-facing Google
 * category such as bar, restaurant, or event venue. That makes them look like
 * ordinary visitor destinations to category-based ranking even though access
 * may depend on membership or a private event.
 *
 * Keep these records available to Search, Map, Saved, and direct links, but do
 * not promote them as places a visitor can simply walk into. This is a narrow
 * name-based safety gate for unmistakable lodge/post names, not a general
 * blacklist for community organizations.
 */
const RESTRICTED_MEMBERSHIP_VENUE_RE =
  /\b(?:fraternal\s+order\s+of\s+eagles|eagles?\s+(?:lodge|aerie)|aerie\s+(?:no\.?\s*)?#?\d+|elks?\s+lodge|moose\s+lodge|american\s+legion(?:\s+post)?|v\.?f\.?w\.?|veterans\s+of\s+foreign\s+wars)\b/i;

// Some business records explicitly say that the mapped address is an office,
// not a customer destination. Keep them searchable, but never recommend them
// as somewhere to get coffee, food, or another walk-in need.
const NON_CUSTOMER_DESTINATION_RE =
  /\b(?:office only|not open to (?:the )?public)\b/i;

export function isRestrictedMembershipVenue(
  name: string | null | undefined,
): boolean {
  return Boolean(name && RESTRICTED_MEMBERSHIP_VENUE_RE.test(name));
}

/**
 * Junk records suppressed from discovery entirely — bulk-import artifacts
 * that are not real destinations (a generic SEO "listings" record, a
 * single-letter scrape fragment that grabbed a neighbor's photo). Kept
 * deliberately TIGHT and explicit: obvious junk only, never a subjective
 * taste sweep. Not folded — they are not a duplicate of any real place.
 */
export const SUPPRESSED_JUNK_SLUGS: ReadonlySet<string> = new Set([
  "best-of-business-listings",
  "a",
]);

/**
 * Should this record be allowed to LEAD a recommendation surface?
 * Private membership venues are always held out of promotion. Otherwise,
 * false only when ALL hold: its Google primaryType is a pure institution
 * (deny-set), it is a bulk-imported record (dfp/google; curated seed/manual
 * is intentional and always kept), and it is not on the rescue list.
 * Vague or absent type means recommendable because we never guess a place
 * away.
 */
export function isRecommendable(p: {
  name?: string | null;
  primary_type?: string | null;
  source: string;
  slug: string;
}): boolean {
  if (isRestrictedMembershipVenue(p.name)) return false;
  if (p.name && NON_CUSTOMER_DESTINATION_RE.test(p.name)) return false;
  if (RECOMMEND_ALLOW_SLUGS.has(p.slug)) return true;
  const t = p.primary_type?.trim().toLowerCase();
  if (!t || !RECOMMENDATION_DENY_TYPES.has(t)) return true;
  // Source guard: a curated record is an intentional editorial choice and is
  // never auto-denied; every bulk import is.
  //
  // This is an ALLOW-list on purpose. It was written as "deny dfp and
  // google", which reads the same until a third bulk source appears —
  // and "discovered" is now the largest source in the catalog (901
  // records). Eight institutions rode that gap back into recommendations,
  // which is how Walkersville High School reached the Family lead in the
  // school-run hours, when the real outings are still closed.
  return CURATED_SOURCES.has(p.source);
}

/**
 * Categories that are personal services, civic/utility, or pure amenities —
 * places someone may *need*, but won't browse a town's "worth your time"
 * highlight reel for. The town page's "Worth your time" reel was sorted on
 * raw feature_score, which is saturated at 10.0 for hundreds of unenriched
 * DFP imports, so the reel led with Crossfits, personal-training studios,
 * psychological-services offices, and a Quaker meeting house instead of the
 * breweries / galleries / shops the page promises (audit T4).
 *
 * The usual eligibility lever (isRecommendable) can't help here: these rows
 * carry no Google primary_type to deny on. The signal that DOES separate a
 * destination from a practitioner is the CATEGORY — practitioners land in
 * `wellness`/`services`, civic rooms in `civic`/`worship`. So we down-rank
 * (never delete) these in destination-led highlight surfaces. A real shop in
 * `shopping` still leads; a massage studio in `wellness` sinks below it.
 */
export const NON_DESTINATION_CATEGORIES: ReadonlySet<string> = new Set([
  "wellness",
  "yoga",
  "services",
  "civic",
  "government",
  "public-safety",
  "voting",
  "worship",
  "pharmacy",
  "hardware",
  "transit",
  "parking",
  "lodging",
  // Pure amenities — useful on the map, never a "worth your time" pick.
  "amenities",
  "restroom",
  "water",
  "trash",
  "recycling",
  "dog-waste",
  "wifi",
  "bench",
  "picnic",
  "bike-parking",
  "bike-repair",
  "defibrillator",
  "shelter",
]);

/** True for categories a visitor explores for their own sake (food, arts,
 *  outdoors, shops, museums…). Used to favor destinations over services in
 *  destination-led highlight reels like a town's "Worth your time". */
export function isDestinationCategory(category: string | null | undefined): boolean {
  return !NON_DESTINATION_CATEGORIES.has((category ?? "").trim().toLowerCase());
}
