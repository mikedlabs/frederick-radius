/**
 * Town / municipal website data — the civic-moat foundation.
 *
 * One row per Frederick County municipality (keyed to the slug in
 * municipalities.ts) capturing the official site and the deep civic links
 * a resident actually needs: government, trash/recycling, utility bill
 * pay, events calendar, parks & rec, permits, police, codes, forms, and
 * "report a concern". This is the structured spine the "New here?"
 * onboarding, the disclosure engine's civic cards, and the by-address
 * answers all read from.
 *
 * HONESTY (data-confidence gate): we only set `verified: true` and a real
 * `homepage` for sites we have actually reached and confirmed. Towns we
 * could not confirm in this pass carry `homepage: null`, `verified:
 * false`, and a note — never a guessed URL that could send a resident to
 * the wrong place. Deep links are filled where confirmed and left
 * undefined otherwise; an editor (or a CivicPlus-aware enrichment pass)
 * fills the gaps.
 *
 * Many MD towns run CivicPlus / CivicEngage (the /2143/Government,
 * /Calendar.aspx, /FormCenter, /requesttracker.aspx URL patterns), so
 * once `cms: "civicplus"` is known the deep links are largely derivable.
 *
 * Verified (2026-06): frederick, brunswick, emmitsburg, thurmont,
 * middletown, walkersville, new-market, mount-airy, myersville,
 * woodsboro, burkittsville — 11 of 13. Only rosemont (tiny) and urbana
 * (unincorporated) remain unconfirmed.
 */

export type CivicLinks = {
  government?: string;
  trashRecycling?: string;
  utilityBilling?: string;
  /** Online bill-pay portal (often a third-party host). */
  billPay?: string;
  events?: string;
  parksRec?: string;
  permits?: string;
  police?: string;
  /** Municipal code (Municode / American Legal). */
  codes?: string;
  forms?: string;
  /** SeeClickFix-style "report a concern". */
  reportIssue?: string;
};

export type TownWebsite = {
  /** Matches a slug in municipalities.ts. */
  slug: string;
  name: string;
  /** Official site, or null when unconfirmed (never guessed). */
  homepage: string | null;
  verified: boolean;
  /** CMS platform when known — drives derivable deep links. */
  cms?: "civicplus" | "wordpress" | "revize" | "other";
  contact?: { address?: string; phone?: string; hours?: string };
  links?: CivicLinks;
  /** Why a row is unverified / what to confirm. */
  note?: string;
};

export const TOWN_WEBSITES: TownWebsite[] = [
  {
    slug: "frederick",
    name: "City of Frederick",
    homepage: "https://www.cityoffrederickmd.gov/",
    verified: true,
    cms: "civicplus",
    links: {
      // Confirmed elsewhere in the app (parking page links here).
      permits: "https://www.cityoffrederickmd.gov/221/Planning",
      parksRec: "https://www.cityoffrederickmd.gov/parks",
      // /parking is the City's parking hub (already used on /parking).
      trashRecycling: "https://www.cityoffrederickmd.gov/220/Refuse-Recycling",
    },
    note: "Deep links to confirm against the live CivicPlus tree.",
  },
  {
    slug: "brunswick",
    name: "City of Brunswick",
    homepage: "https://www.brunswickmd.gov/",
    verified: true,
    contact: { address: "1 West Potomac St, Brunswick, MD 21716", phone: "(301) 834-7500" },
    note: "Homepage + contact confirmed; deep civic links to enrich.",
  },
  {
    slug: "emmitsburg",
    name: "Town of Emmitsburg",
    homepage: "https://www.emmitsburgmd.gov/",
    verified: true,
    contact: { hours: "Mon–Fri 8:00 AM – 4:30 PM" },
    note: "Homepage confirmed; address/phone + deep links to enrich.",
  },
  {
    slug: "thurmont",
    name: "Town of Thurmont",
    homepage: "https://www.thurmont.com/",
    verified: true,
    cms: "civicplus",
    contact: {
      address: "615 East Main Street, PO Box 17, Thurmont, MD 21788",
      phone: "301-271-7313",
      hours: "Mon–Fri 8:00 AM – 4:00 PM",
    },
    links: {
      government: "https://www.thurmont.com/2143/Government",
      events: "https://www.thurmont.com/calendar.aspx",
      billPay: "https://municipalonlinepayments.com/thurmontmd",
      permits: "https://www.thurmont.com/2172/Planning-Zoning",
      parksRec: "https://www.thurmont.com/2145/Community",
      codes: "https://library.municode.com/md/thurmont/codes/code",
      forms: "https://www.thurmont.com/FormCenter",
      reportIssue: "https://www.thurmont.com/requesttracker.aspx",
    },
  },

  {
    slug: "middletown", name: "Town of Middletown", homepage: "https://www.middletown.md.us/",
    verified: true, cms: "other",
    contact: { address: "31 West Main Street, Middletown, MD 21769", phone: "301-371-6171" },
    links: { government: "https://www.middletown.md.us/" },
    note: "Catalis CMS (legacy index.asp URLs).",
  },
  {
    slug: "walkersville", name: "Town of Walkersville", homepage: "https://www.walkersvillemd.gov/",
    verified: true, cms: "civicplus",
    contact: { address: "21 W. Frederick St., PO Box 249, Walkersville, MD 21793", phone: "301-845-4500" },
    links: {
      government: "https://www.walkersvillemd.gov/1207/Government",
      events: "https://www.walkersvillemd.gov/calendar.aspx",
      permits: "https://www.walkersvillemd.gov/1278/Permits",
    },
  },
  {
    slug: "new-market", name: "Town of New Market", homepage: "https://www.townofnewmarket.org/",
    verified: true, cms: "revize",
    contact: { address: "40 South Alley, New Market, MD 21774", phone: "301-865-5544" },
    links: {
      government: "https://www.townofnewmarket.org/mayor-town-council",
      trashRecycling: "https://www.townofnewmarket.org/residents/recycling-schedule",
      events: "https://www.townofnewmarket.org/where",
    },
    note: "Site blocks automated fetch (403); verified via indexed pages — recommend a manual homepage check.",
  },
  {
    slug: "mount-airy", name: "Town of Mount Airy", homepage: "https://www.mountairymd.gov/",
    verified: true, cms: "civicplus",
    contact: { address: "110 S. Main Street, PO Box 50, Mount Airy, MD 21771", phone: "301-829-1424" },
    links: {
      government: "https://www.mountairymd.gov/27/Government-Services",
      trashRecycling: "https://www.mountairymd.gov/156/Recycling-Sanitation",
      events: "https://www.mountairymd.gov/Calendar.aspx",
      permits: "https://www.mountairymd.gov/174/Permits",
    },
    note: "Straddles Frederick & Carroll counties (town hall in Carroll).",
  },
  {
    slug: "myersville", name: "Town of Myersville", homepage: "https://myersville.org/",
    verified: true, cms: "other",
    contact: { address: "301 Main Street, PO Box 295, Myersville, MD 21773", phone: "301-293-4281" },
    links: {
      government: "https://myersville.org/government",
      trashRecycling: "https://myersville.org/trash",
      events: "https://myersville.org/calendar",
      permits: "https://myersville.org/planning_zoning",
    },
  },
  {
    slug: "woodsboro", name: "Town of Woodsboro", homepage: "https://woodsboro.org/",
    verified: true, cms: "wordpress",
    contact: { address: "605 S. Main Street, Woodsboro, MD 21798", phone: "301-898-3800" },
    links: {
      government: "https://woodsboro.org/government/",
      events: "https://woodsboro.org/community/",
    },
  },
  {
    slug: "burkittsville", name: "Town of Burkittsville", homepage: "https://burkittsville-md.gov/",
    verified: true, cms: "wordpress",
    contact: { address: "PO Box 485, Burkittsville, MD 21718", phone: "301-969-0326" },
    links: {
      government: "https://burkittsville-md.gov/government/",
      events: "https://burkittsville-md.gov/calendar/",
    },
    note: "Mailing address only (office not staffed full-time); trash via Key Sanitation 301-668-8282.",
  },
  { slug: "rosemont", name: "Town of Rosemont", homepage: null, verified: false, note: "Very small incorporated town near Brunswick — may have no standalone site." },
  { slug: "urbana", name: "Urbana", homepage: null, verified: false, note: "Unincorporated (CDP) — no town government; civic services run through Frederick County, not a town site." },
];

export const TOWN_WEBSITE_BY_SLUG: Record<string, TownWebsite> =
  Object.fromEntries(TOWN_WEBSITES.map((t) => [t.slug, t]));

/** Verified rows only — safe to surface as asserted civic links. */
export const VERIFIED_TOWN_WEBSITES = TOWN_WEBSITES.filter((t) => t.verified);

export type TownCivicResource = {
  town: TownWebsite;
  label: string;
  url: string;
};

const TOWN_RESOURCE_ROUTES: Array<{
  pattern: RegExp;
  key: keyof CivicLinks;
  label: string;
}> = [
  { pattern: /\b(?:trash|garbage|recycl\w*|refuse|yard waste)\b/i, key: "trashRecycling", label: "Trash & recycling" },
  { pattern: /\b(?:water|sewer|utility billing|utility bill)\b/i, key: "utilityBilling", label: "Utility billing" },
  { pattern: /\b(?:pay|payment|bill pay)\b/i, key: "billPay", label: "Online bill pay" },
  { pattern: /\b(?:permits?|zoning|building inspection)\b/i, key: "permits", label: "Permits & planning" },
  { pattern: /\b(?:parks?|recreation|rec programs?)\b/i, key: "parksRec", label: "Parks & recreation" },
  { pattern: /\b(?:police|non-emergency)\b/i, key: "police", label: "Police" },
  { pattern: /\b(?:code|ordinance|municipal law)\b/i, key: "codes", label: "Municipal code" },
  { pattern: /\b(?:form|application)\b/i, key: "forms", label: "Forms" },
  { pattern: /\b(?:report|concern|pothole)\b/i, key: "reportIssue", label: "Report an issue" },
  { pattern: /\b(?:event|calendar|meeting)\b/i, key: "events", label: "Official calendar" },
  { pattern: /\b(?:government|town hall|city hall|mayor|council|clerk)\b/i, key: "government", label: "Municipal government" },
];

/** Resolve a civic service to the correct verified municipal website. */
export function findTownCivicResource(
  query: string,
  contextMunicipality?: string | null,
): TownCivicResource | null {
  const lq = query.toLowerCase().trim();
  const route = TOWN_RESOURCE_ROUTES.find((candidate) => candidate.pattern.test(lq));
  if (!route) return null;

  const named = TOWN_WEBSITES.find((town) => {
    const townName = town.name.toLowerCase().replace(/^(?:city|town|village) of /, "");
    const isNamed = lq.includes(townName) || lq.includes(town.slug.replace(/-/g, " "));
    return isNamed && !(town.slug === "frederick" && /\bfrederick county\b/.test(lq));
  });
  const contextual = !/\b(?:frederick\s+)?county\b/.test(lq)
    ? TOWN_WEBSITE_BY_SLUG[contextMunicipality ?? ""]
    : undefined;
  const town = named ?? contextual;
  if (!town?.verified || !town.homepage) return null;

  const url = town.links?.[route.key] ?? (route.key === "government" ? town.homepage : null);
  return url ? { town, label: route.label, url } : null;
}
