/**
 * Civic actions — the county's "How Do I…" intents, structured.
 *
 * Source: frederickcountymd.gov/8890/How-Do-I (confirmed 2026-06). The
 * county's own enumeration of resident intents, grouped by verb, each
 * pointing at the authoritative action URL. This is the corpus the Ask
 * concierge grounds "how do I X" answers in (never invented), the civic
 * menu for "New here?" onboarding, and a source of Verified civic cards
 * for the disclosure engine.
 *
 * Curated, not scraped at runtime — this list changes rarely. Keep the
 * URLs honest: every one is the county's published link.
 */

export type CivicVerb = "contact" | "find" | "pay" | "register" | "report" | "request" | "view";

export type CivicAction = {
  id: string;
  verb: CivicVerb;
  /** Resident-voice label ("Report a pothole or concern"). */
  label: string;
  url: string;
  /** Search terms so the Ask can match natural phrasings. */
  keywords?: string[];
};

export const CIVIC_VERB_LABEL: Record<CivicVerb, string> = {
  contact: "Contact", find: "Find", pay: "Pay", register: "Register for",
  report: "Report", request: "Request", view: "View",
};

export const CIVIC_ACTIONS: CivicAction[] = [
  // ── Contact ──
  { id: "agency-text", verb: "contact", label: "Text an agency directly", url: "https://frederickcountymd.gov/8626/Agency-Text-Lines" },
  { id: "county-council", verb: "contact", label: "The County Council", url: "https://frederickcountymd.gov/591/County-Council", keywords: ["councilmember", "representative"] },
  { id: "county-executive", verb: "contact", label: "The County Executive", url: "https://frederickcountymd.gov/5931/County-Executive" },
  { id: "staff-directory", verb: "contact", label: "County staff directory", url: "https://frederickcountymd.gov/directory.aspx", keywords: ["phone", "who do i call"] },

  // ── Find ──
  { id: "bus-connector", verb: "find", label: "Bus Connector routes", url: "https://www.frederickcountymd.gov/199/Connector-Schedules", keywords: ["transit", "bus", "schedule"] },
  { id: "bus-shuttle", verb: "find", label: "Bus shuttle routes", url: "https://www.frederickcountymd.gov/200/Shuttle-Schedules", keywords: ["transit", "marc", "commuter"] },
  { id: "jobs", verb: "find", label: "County jobs", url: "https://frederickmd.attract.neogov.com/", keywords: ["employment", "hiring", "careers"] },
  { id: "jury-duty", verb: "find", label: "Jury duty information", url: "https://www.courts.state.md.us/clerks/frederick/juryinfo" },
  { id: "libraries", verb: "find", label: "Libraries (FCPL)", url: "https://www.fcpl.org/", keywords: ["library", "books", "card"] },
  { id: "parks-rec-centers", verb: "find", label: "Parks & rec centers", url: "https://www.recreater.com/35/Parks", keywords: ["park", "recreation"] },
  { id: "pets-adoption", verb: "find", label: "Pets for adoption", url: "https://frederickcountymd.gov/114/Adopt", keywords: ["dog", "cat", "shelter", "animal"] },
  { id: "broadband", verb: "find", label: "Rural broadband program", url: "https://frederickcountymd.gov/8142/Broadband-Information", keywords: ["internet"] },
  { id: "events-meetings", verb: "find", label: "Upcoming events & meetings", url: "https://www.frederickcountymd.gov/calendar.aspx", keywords: ["calendar"] },
  { id: "volunteer", verb: "find", label: "Volunteering & donations", url: "https://www.frederickcountymd.gov/5932/DonateVolunteer", keywords: ["donate", "give"] },
  { id: "boards-commissions", verb: "find", label: "Boards & commissions", url: "https://www.frederickcountymd.gov/1518/Boards-Commissions" },

  // ── Pay ──
  { id: "pay-bills", verb: "pay", label: "Bills online (taxes, utilities)", url: "https://www.frederickcountymd.gov/1372/Online-Bill-Inquiries-Payments", keywords: ["tax", "water", "sewer", "bill"] },

  // ── Register for ──
  { id: "register-vote", verb: "register", label: "Voter registration", url: "https://frederickcountymd.gov/1648/Voter-Registration---RegisterMake-Change", keywords: ["vote", "election", "ballot"] },
  { id: "marriages", verb: "register", label: "Marriage license", url: "https://www.courts.state.md.us/clerks/frederick/marriage", keywords: ["wedding"] },
  { id: "deeds", verb: "register", label: "Record a deed", url: "https://www.frederickcountymd.gov/7861/Record-a-Deed" },
  { id: "housing-voucher", verb: "register", label: "Housing Choice Voucher", url: "https://www.frederickcountymd.gov/6386/Housing-Choice-Voucher", keywords: ["section 8", "rent assistance"] },
  { id: "rx-discount", verb: "register", label: "Free prescription discount program", url: "https://frederickcountymd.gov/1295/Free-Prescription-Discount-Drug-Program" },
  { id: "severe-weather", verb: "register", label: "Severe weather warnings", url: "https://frederickcountymd.gov/7176/Severe-Weather-Communication", keywords: ["alerts", "emergency"] },
  { id: "sports-leagues", verb: "register", label: "Sports leagues", url: "https://www.recreater.com/388/Sports-Leagues" },
  { id: "rec-activities", verb: "register", label: "Parks & rec activities", url: "https://anc.apm.activecommunities.com/frederickcntyparksandrec/activity/search", keywords: ["classes", "camp"] },
  { id: "adopt-road", verb: "register", label: "Adopt-a-Road", url: "https://frederickcountymd.gov/1756/Adopt-A-Road" },
  { id: "taxi-access", verb: "register", label: "Taxi Access Program", url: "https://www.frederickcountymd.gov/6483/Taxi-Access-Program", keywords: ["transit-plus", "disability ride"] },

  // ── Report ──
  { id: "fixit", verb: "report", label: "Report a concern or issue (FixIT)", url: "https://www.frederickcountymd.gov/8235/FCG-FixIT", keywords: ["pothole", "complaint", "problem", "seeclickfix"] },
  { id: "missing-recycling", verb: "report", label: "Missed recycling collection", url: "https://www.frederickcountymd.gov/6842/Carts-Bins-for-Collecting-Recyclables", keywords: ["trash", "recycling", "pickup"] },
  { id: "wild-animals", verb: "report", label: "Dangerous wild animals", url: "https://www.frederickcountymd.gov/15/Animal-Control", keywords: ["animal control"] },
  { id: "citizen-accident", verb: "report", label: "A citizen accident", url: "https://frederickcountymd-forms-risk-management-office.app.transform.civicplus.com/forms/40635" },

  // ── Request ──
  { id: "permits", verb: "request", label: "Permits or inspections", url: "https://www.frederickcountymd.gov/7974/Permits-and-Inspections", keywords: ["building", "permit", "zoning"] },
  { id: "birth-death", verb: "request", label: "Birth or death certificates", url: "https://health.frederickcountymd.gov/186/Birth-Death-Certificates" },
  { id: "burn-permit", verb: "request", label: "Burn permit", url: "https://health.frederickcountymd.gov/344/Burn-Permit" },
  { id: "food-license", verb: "request", label: "Food license", url: "https://health.frederickcountymd.gov/352/Food-Control", keywords: ["restaurant", "vendor"] },
  { id: "liquor-license", verb: "request", label: "Liquor license or inspection", url: "https://frederickcountymd.gov/1291/Liquor-Board" },
  { id: "public-records", verb: "request", label: "Public records (PIA)", url: "https://frederickcountymd.govqa.us/WEBAPP/_rs/supporthome.aspx", keywords: ["foia", "mpia"] },
  { id: "recycling-bin", verb: "request", label: "Replacement recycling bin", url: "https://www.frederickcountymd.gov/6842/Carts-Bins-for-Collecting-Recyclables" },
  { id: "vaccinations", verb: "request", label: "Vaccination / immunization services", url: "https://health.frederickcountymd.gov/285/Immunizations-Clinic", keywords: ["shots", "vaccine"] },

  // ── View ──
  { id: "agendas", verb: "view", label: "Meeting agendas & minutes", url: "https://www.frederickcountymd.gov/agendacenter", keywords: ["council", "vote"] },
  { id: "budget", verb: "view", label: "County budget", url: "https://frederickcountymd.gov/66/Budget-Office" },
  { id: "ordinances", verb: "view", label: "Council resolutions & ordinances", url: "https://frederickcountymd.gov/6455/Council-Ordinances-and-Resolutions", keywords: ["law", "code"] },
  { id: "holidays", verb: "view", label: "County government holidays", url: "https://www.frederickcountymd.gov/4367/County-Government-Holidays", keywords: ["closed", "hours"] },
  { id: "road-closures", verb: "view", label: "Road closures", url: "https://www.frederickcountymd.gov/5052/Roads-Closed", keywords: ["traffic", "detour"] },
  { id: "stray-animals", verb: "view", label: "Found stray animals", url: "https://frederickcountymd.gov/1995/Stray-Animals", keywords: ["lost pet"] },
  { id: "schools", verb: "view", label: "Schools (FCPS)", url: "https://www.fcps.org/", keywords: ["closings", "school"] },
  { id: "zoning", verb: "view", label: "Property zoning", url: "https://www.frederickcountymd.gov/7949/Zoning", keywords: ["parcel", "land use"] },
  { id: "plats", verb: "view", label: "Recorded plats (GIS viewer)", url: "https://maps.frederickcountymd.gov/Html5Viewer/Index.html" },
];

export const CIVIC_ACTIONS_BY_VERB = (verb: CivicVerb) =>
  CIVIC_ACTIONS.filter((a) => a.verb === verb);

const CIVIC_INTENT =
  /\b(?:county office|city office|government|agency|department|official|contact|call|phone|report|request|register|apply|pay|permit|license|vote|voting|election|ballot|pothole|recycling|trash|tax|bill|zoning|ordinance|budget|council|jury|public records?|foia|mpia|road closures?|school clos(?:ing|ure)s?|bus|transit|adopt|animal control|marriage|deed|broadband|volunteer)\b/i;

const CIVIC_STOP = new Set([
  "a", "an", "and", "can", "city", "county", "do", "for", "frederick", "get", "handle", "handles", "how", "i",
  "information", "maryland", "of", "official", "online", "or", "the", "to",
  "what", "where", "who", "with",
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !CIVIC_STOP.has(token));
}

/**
 * Match an official action only when the query actually reads like a civic
 * task. Tokens are compared as whole words, so conversational words such as
 * "get" can never match the middle of "budget".
 */
export function matchCivicAction(query: string): CivicAction | null {
  if (!CIVIC_INTENT.test(query)) return null;
  const queryTokens = new Set(tokens(query));
  const explicitVerbs = new Set<CivicVerb>(
    (["contact", "find", "pay", "register", "report", "request", "view"] as CivicVerb[])
      .filter((verb) => queryTokens.has(verb)),
  );
  let best: CivicAction | null = null, bestScore = 0;
  for (const a of CIVIC_ACTIONS) {
    if (a.id === "food-license" && !/\b(?:(?:food|restaurant|vendor)\s+(?:license|permit)|(?:license|permit)\s+(?:for\s+)?(?:food|restaurant|vendor)|health inspection)\b/i.test(query)) {
      continue;
    }
    // An explicit action verb is a contract. "Find a trash can" must not
    // silently become "report missed recycling" just because both contain
    // the word trash.
    if (explicitVerbs.size > 0 && !explicitVerbs.has(a.verb)) continue;
    const actionTokens = new Set(tokens([a.label, ...(a.keywords ?? [])].join(" ")));
    let subjectScore = 0;
    for (const term of queryTokens) if (actionTokens.has(term)) subjectScore += 2;
    for (const phrase of a.keywords ?? []) {
      if (phrase.includes(" ") && query.toLowerCase().includes(phrase.toLowerCase())) subjectScore += 4;
    }
    // A generic verb such as "find" is never enough evidence by itself.
    if (subjectScore === 0) continue;
    const score = subjectScore + (queryTokens.has(a.verb) ? 3 : 0);
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return bestScore > 0 ? best : null;
}
