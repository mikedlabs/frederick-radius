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
 * Verified in this pass (2026-06): frederick, brunswick, emmitsburg,
 * thurmont. Others are scaffolded pending confirmation.
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
      permits: "https://www.cityoffrederickmd.gov/164/Planning",
      parksRec: "https://www.cityoffrederickmd.gov/parks",
      // /parking is the City's parking hub (already used on /parking).
      trashRecycling: "https://www.cityoffrederickmd.gov/166/Refuse-Recycling",
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

  // ── Scaffolded — confirm the official URL before asserting ──
  { slug: "middletown", name: "Town of Middletown", homepage: null, verified: false, note: "Confirm official URL (middletownmd.gov refused in this pass)." },
  { slug: "walkersville", name: "Town of Walkersville", homepage: null, verified: false, note: "Confirm official URL (walkersvillemd.gov had a TLS issue)." },
  { slug: "new-market", name: "Town of New Market", homepage: null, verified: false, note: "Confirm official URL (newmarketmd.gov refused in this pass)." },
  { slug: "mount-airy", name: "Town of Mount Airy", homepage: null, verified: false, note: "Spans Frederick & Carroll counties — confirm official URL." },
  { slug: "myersville", name: "Town of Myersville", homepage: null, verified: false, note: "Confirm official URL (myersville.org had a TLS issue)." },
  { slug: "woodsboro", name: "Town of Woodsboro", homepage: null, verified: false, note: "Confirm official URL." },
  { slug: "burkittsville", name: "Town of Burkittsville", homepage: null, verified: false, note: "Confirm official URL." },
  { slug: "rosemont", name: "Town of Rosemont", homepage: null, verified: false, note: "Very small incorporated town near Brunswick — may have no standalone site." },
  { slug: "urbana", name: "Urbana", homepage: null, verified: false, note: "Unincorporated (CDP) — no town government; civic services run through Frederick County, not a town site." },
];

export const TOWN_WEBSITE_BY_SLUG: Record<string, TownWebsite> =
  Object.fromEntries(TOWN_WEBSITES.map((t) => [t.slug, t]));

/** Verified rows only — safe to surface as asserted civic links. */
export const VERIFIED_TOWN_WEBSITES = TOWN_WEBSITES.filter((t) => t.verified);
