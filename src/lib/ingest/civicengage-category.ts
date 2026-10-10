/**
 * CivicEngage catID → Radius category + visibility scope.
 *
 * County and City CivicEngage calendars are fetched per numeric catID. The
 * official names for those IDs live on each domain's /iCalendar.aspx page.
 * `config/civicengage_sources.json` labels are a separate display concern
 * (PR #1729) and are often wrong on main, so this table is keyed by
 * domain + catID, never by label text.
 *
 * Scope values match draft PR #1740 (`public` | `campus` | `notice`) so a
 * later hydrate can hide notice rows from Today without this module writing
 * a column. Until that lands, `category: "civic"` already lanes meetings
 * and notices out of public discovery via classifyEvent.
 *
 * Source: Source Ops live-verified table, 2026-10-10.
 */
import { CATEGORY_BY_SLUG } from "@/data/categories";

export const COUNTY_CIVICENGAGE_DOMAIN = "www.frederickcountymd.gov";
export const CITY_CIVICENGAGE_DOMAIN = "www.cityoffrederickmd.gov";

/** Compatible with src/lib/events/eventScope.ts in draft PR #1740. */
export type CivicEngageEventScope = "public" | "campus" | "notice";

export type CivicEngageCategoryHit = {
  category: string;
  scope: CivicEngageEventScope;
};

function entry(
  category: string,
  scope: CivicEngageEventScope = "public",
): CivicEngageCategoryHit {
  return { category, scope };
}

/**
 * Enabled Frederick County + City of Frederick catIDs only. Town calendars
 * (Thurmont, Mount Airy, Walkersville) are left unmapped until those IDs
 * are re-verified.
 */
const BY_DOMAIN_CATID: Readonly<Record<string, CivicEngageCategoryHit>> = {
  // County public / community
  [`${COUNTY_CIVICENGAGE_DOMAIN}:64`]: entry("community"), // Aging and Independence
  // Liquor Board special licenses: NYE parties, bar fundraisers, bingo.
  // Community only. Never family or kid-friendly.
  [`${COUNTY_CIVICENGAGE_DOMAIN}:74`]: entry("community"),
  [`${COUNTY_CIVICENGAGE_DOMAIN}:50`]: entry("outdoors"), // Energy and Environment
  [`${COUNTY_CIVICENGAGE_DOMAIN}:88`]: entry("community"), // Solid Waste (e.g. film screening)
  [`${COUNTY_CIVICENGAGE_DOMAIN}:94`]: entry("family"), // Fire & Rescue (car-seat checks, safety)

  // County notices (hidden from Today once event_scope hydrates)
  [`${COUNTY_CIVICENGAGE_DOMAIN}:71`]: entry("civic", "notice"), // Equity Office observances
  [`${COUNTY_CIVICENGAGE_DOMAIN}:25`]: entry("civic", "notice"), // Procurement RFPs

  // County civic meetings
  [`${COUNTY_CIVICENGAGE_DOMAIN}:73`]: entry("civic"), // County Council
  [`${COUNTY_CIVICENGAGE_DOMAIN}:77`]: entry("civic"), // Planning & Permitting
  [`${COUNTY_CIVICENGAGE_DOMAIN}:80`]: entry("civic"), // County Council Meetings & Workshops
  [`${COUNTY_CIVICENGAGE_DOMAIN}:81`]: entry("civic"), // Boards & Commissions
  [`${COUNTY_CIVICENGAGE_DOMAIN}:82`]: entry("civic"), // Sustainability Commission
  [`${COUNTY_CIVICENGAGE_DOMAIN}:83`]: entry("civic"), // FCG TV (broadcast meetings)
  [`${COUNTY_CIVICENGAGE_DOMAIN}:87`]: entry("civic"), // Veterans Advisory Council
  [`${COUNTY_CIVICENGAGE_DOMAIN}:90`]: entry("civic"), // Office of Agriculture (mostly boards)

  // City
  [`${CITY_CIVICENGAGE_DOMAIN}:14`]: entry("civic"), // City of Frederick Calendar (mostly meetings)
  [`${CITY_CIVICENGAGE_DOMAIN}:23`]: entry("community"), // Economic Development (public business hours)
  [`${CITY_CIVICENGAGE_DOMAIN}:27`]: entry("family"), // Parks & Recreation
};

function keyOf(domain: string, catID: number): string {
  return `${domain}:${catID}`;
}

/** Pure lookup. Unknown domain or catID → null (caller keeps its fallback). */
export function lookupCivicEngageCategory(
  domain: string,
  catID: number,
): CivicEngageCategoryHit | null {
  return BY_DOMAIN_CATID[keyOf(domain, catID)] ?? null;
}

/** Radius slug to write at ingest, or null when this feed is unmapped. */
export function civicEngageRadiusCategory(
  domain: string,
  catID: number,
): string | null {
  return lookupCivicEngageCategory(domain, catID)?.category ?? null;
}

/**
 * True when a stored ingested category is a real Radius slug and safe to
 * surface. CivicEngage used to persist calendar labels ("Workforce Services");
 * those stay quarantined at hydrate until a complete ingest heals the row.
 */
export function isSurfacedCivicEngageCategory(
  category: string | null | undefined,
): boolean {
  return Boolean(category && CATEGORY_BY_SLUG[category]);
}
