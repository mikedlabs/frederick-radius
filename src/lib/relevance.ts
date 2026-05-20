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
