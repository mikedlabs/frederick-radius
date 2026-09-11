/**
 * Frederick County government department contacts — phone + address.
 *
 * The "who do I call" civic-moat data for residents/visitors. Compiled
 * from each department's official page on frederickcountymd.gov
 * (confirmed 2026-06). Where a department publishes no direct number/
 * address (it routes through the main county line), the field is null —
 * never guessed. Pairs with civic-actions.ts (the "how do I…" tasks).
 *
 * Main county line: 301-600-9000 · Winchester Hall, 12 E. Church St,
 * Frederick, MD 21701.
 */

export type DepartmentContact = {
  slug: string;
  name: string;
  url: string;
  phone: string | null;
  address: string | null;
  jurisdiction?: "county" | "city";
};

export const DEPARTMENT_CONTACTS: DepartmentContact[] = [
  { slug: "aging-independence", name: "Aging & Independence", url: "https://www.frederickcountymd.gov/54/Aging-and-Independence", phone: "301-600-1234", address: "1440 Taney Avenue, Frederick, MD 21702" },
  { slug: "agriculture", name: "Agriculture", url: "https://www.frederickcountymd.gov/8675/Agriculture", phone: "301-600-3039", address: "118 N. Market St., Frederick, MD 21701" },
  { slug: "animal-control", name: "Animal Control", url: "https://www.frederickcountymd.gov/15/Animal-Control", phone: "301-600-1546", address: "1832 Rosemont Ave., Frederick, MD 21702" },
  { slug: "budget", name: "Budget", url: "https://www.frederickcountymd.gov/66/Budget-Office", phone: "301-600-1185", address: "Winchester Hall, 12 E. Church St., Frederick, MD 21701" },
  { slug: "communications", name: "Communications & Public Engagement", url: "https://www.frederickcountymd.gov/6758/Communications-and-Public-Engagement-Off", phone: "301-600-6740", address: "Winchester Hall, 12 E. Church St., Frederick, MD 21701" },
  { slug: "administrative-services", name: "County Administrative Services", url: "https://www.frederickcountymd.gov/8350/County-Administrative-Services", phone: "301-600-9000", address: "12 E. Church St., Frederick, MD 21701" },
  { slug: "county-attorney", name: "County Attorney", url: "https://www.frederickcountymd.gov/60/County-Attorney", phone: "301-600-1030", address: "12 E. Church St., Frederick, MD 21701" },
  { slug: "county-council", name: "County Council", url: "https://www.frederickcountymd.gov/591/County-Council", phone: "301-600-1135", address: "Winchester Hall, 12 E. Church St., Frederick, MD 21701" },
  { slug: "county-executive", name: "County Executive", url: "https://www.frederickcountymd.gov/5931/County-Executive", phone: "301-600-9000", address: "12 E. Church St., Frederick, MD 21701" },
  { slug: "courts", name: "Courts", url: "https://www.frederickcountymd.gov/2027/Courts", phone: null, address: null },
  { slug: "economic-opportunity", name: "Economic Opportunity", url: "https://www.frederickcountymd.gov/8699/Economic-Opportunity", phone: "301-600-1202", address: "118 N. Market St., Frederick, MD 21701" },
  { slug: "emergency-management", name: "Emergency Management", url: "https://www.frederickcountymd.gov/2001/Emergency-Management", phone: "301-600-6790", address: "5370 Public Safety Place, Frederick, MD 21704" },
  { slug: "energy-environment", name: "Energy & Environment", url: "https://www.frederickcountymd.gov/8496/Energy-and-Environment", phone: "301-600-1416", address: "30 North Market Street, Frederick, MD 21701" },
  { slug: "equity-inclusion", name: "Equity & Inclusion", url: "https://www.frederickcountymd.gov/8166/Equity-and-Inclusion-Office", phone: null, address: null },
  { slug: "family-services", name: "Family Services", url: "https://www.frederickcountymd.gov/16/Family-Services", phone: "301-600-1200", address: "401 Sagner Avenue, Frederick, MD 21701" },
  { slug: "finance", name: "Finance", url: "https://www.frederickcountymd.gov/26/Finance", phone: "301-600-1117", address: "Winchester Hall, 12 E. Church St., Frederick, MD 21701" },
  { slug: "fire-rescue", name: "Fire & Rescue Services", url: "https://www.frederickcountymd.gov/24/Division-of-Fire-Rescue-Services-DFRS", phone: null, address: null },
  { slug: "health", name: "Health Department", url: "https://health.frederickcountymd.gov/", phone: "301-600-1029", address: "350 Montevue Lane, Frederick, MD 21702" },
  { slug: "housing", name: "Housing", url: "https://www.frederickcountymd.gov/6366/Housing", phone: "301-600-1061", address: "401 Sagner Avenue, Frederick, MD 21701" },
  { slug: "human-resources", name: "Human Resources", url: "https://www.frederickcountymd.gov/18/Human-Resources", phone: "301-600-1070", address: "12 E. Church St., Frederick, MD 21701" },
  { slug: "information-technologies", name: "Interagency Information Technologies", url: "https://www.frederickcountymd.gov/17/Information-Technologies", phone: null, address: "Winchester Hall, 12 E. Church Street, Frederick, MD 21701" },
  { slug: "parks-recreation", name: "Parks & Recreation", url: "https://recreater.com/", phone: "301-600-2936", address: "355 Montevue Lane, Suite 100, Frederick, MD 21702" },
  { slug: "planning-permitting", name: "Planning & Permitting", url: "https://www.frederickcountymd.gov/8497/Planning-Permitting", phone: "301-600-1153", address: "30 North Market Street, Frederick, MD 21701" },
  { slug: "procurement", name: "Procurement & Contracting", url: "https://www.frederickcountymd.gov/67/Procurement-and-Contracting", phone: "301-600-1067", address: "Winchester Hall, 12 East Church St., Frederick, MD 21701" },
  { slug: "public-works", name: "Public Works", url: "https://www.frederickcountymd.gov/19/Public-Works", phone: "301-600-1129", address: "355 Montevue Lane, Suite 200, Frederick, MD 21702" },
  { slug: "risk-management", name: "Risk Management", url: "https://www.frederickcountymd.gov/8434/Risk-Management", phone: "301-600-1177", address: "Winchester Hall, 12 E. Church St., Frederick, MD 21701" },
  { slug: "sheriff", name: "Sheriff's Office", url: "https://www.frederickcosheriff.com/", phone: "301-600-1046", address: "110 Airport Drive East, Frederick, MD 21701" },
  { slug: "solid-waste", name: "Solid Waste & Recycling", url: "https://www.frederickcountymd.gov/5634/Solid-Waste-and-Recycling", phone: "301-600-2960", address: "9031 Reichs Ford Road, Frederick, MD 21704" },
  { slug: "transit", name: "Transit Services", url: "https://www.frederickcountymd.gov/105/Transit-Services", phone: "301-600-2065", address: "1040 Rocky Springs Road, Frederick, MD 21702" },
  { slug: "water-sewer", name: "Water & Sewer Utilities", url: "https://www.frederickcountymd.gov/106/Water-and-Sewer-Utilities", phone: "301-600-1825", address: "4520 Metropolitan Court, Frederick, MD 21704" },
];

export const DEPARTMENT_BY_SLUG: Record<string, DepartmentContact> =
  Object.fromEntries(DEPARTMENT_CONTACTS.map((d) => [d.slug, d]));

/**
 * City of Frederick departments (distinct from the county). Compiled from
 * cityoffrederickmd.gov (confirmed 2026-06). Slugs prefixed `city-` so
 * they never collide with the county set.
 */
export const CITY_DEPARTMENTS: DepartmentContact[] = [
  { slug: "city-mayor", name: "Mayor's Office", url: "https://www.cityoffrederickmd.gov/57/Mayors-Office", phone: "301-600-1380", address: "101 N. Court Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-aldermen", name: "Board of Aldermen (City Council)", url: "https://www.cityoffrederickmd.gov/122/City-Council", phone: "301-600-1380", address: "101 N. Court Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-police", name: "Frederick Police Department", url: "https://www.cityoffrederickmd.gov/99/Frederick-Police-Department", phone: "301-600-2101", address: "100 E. All Saints Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-public-works", name: "Public Works (DPW)", url: "https://www.cityoffrederickmd.gov/67/Public-Works", phone: "301-600-1440", address: "111 Airport Drive E, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-planning", name: "Planning", url: "https://www.cityoffrederickmd.gov/221/Planning", phone: "301-600-1499", address: "140 W. Patrick Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-engineering", name: "Engineering", url: "https://www.cityoffrederickmd.gov/179/Engineering", phone: "301-600-1405", address: "140 W. Patrick Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-parks-rec", name: "Parks & Recreation (City)", url: "https://www.cityoffrederickmd.gov/255/Parks-and-Recreation", phone: "301-600-1492", address: "121 N. Bentz Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-economic-dev", name: "Economic Development", url: "https://www.businessinfrederick.com/", phone: "301-600-6360", address: "111 Council Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-finance", name: "Finance (City)", url: "https://www.cityoffrederickmd.gov/193/Finance", phone: "301-600-1399", address: "101 N. Court Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-hr", name: "Human Resources (City)", url: "https://www.cityoffrederickmd.gov/199/Human-Resources", phone: "301-600-1810", address: "101 N. Court Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-permits", name: "Building, Permits & Inspections", url: "https://www.cityoffrederickmd.gov/214/Building-Permits", phone: "301-600-3808", address: "140 W. Patrick Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-sustainability", name: "Sustainability", url: "https://www.cityoffrederickmd.gov/891/Sustainability", phone: "301-600-2843", address: "140 W. Patrick Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-housing", name: "Housing & Human Services (City)", url: "https://hhs.cityoffrederickmd.gov/", phone: "301-600-1506", address: "100 S. Market Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-public-affairs", name: "Public Affairs", url: "https://www.cityoffrederickmd.gov/277/Public-Affairs", phone: "301-600-1380", address: "101 N. Court Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-utility-billing", name: "Utility Billing (Water & Sewer)", url: "https://www.cityoffrederickmd.gov/198/Utility-Billing", phone: "301-600-1421", address: "101 N. Court Street, Frederick, MD 21701", jurisdiction: "city" },
  { slug: "city-code-enforcement", name: "Code Enforcement (City)", url: "https://www.cityoffrederickmd.gov/157/Code-Enforcement", phone: "301-600-3825", address: "140 W. Patrick Street, Frederick, MD 21701", jurisdiction: "city" },
];

/** County + city, every department in one list. */
export const ALL_DEPARTMENTS: DepartmentContact[] = [
  ...DEPARTMENT_CONTACTS.map((d) => ({ ...d, jurisdiction: "county" as const })),
  ...CITY_DEPARTMENTS,
];

const DEPARTMENT_ALIASES: Record<string, string[]> = {
  "animal-control": ["animal", "dog", "cat", "stray", "leash"],
  "budget": ["budget"],
  "county-council": ["council", "representative"],
  "fire-rescue": ["fire", "rescue", "ems"],
  "health": ["health", "clinic", "vaccine"],
  "parks-recreation": ["park", "parks", "recreation", "sports league"],
  "planning-permitting": ["permit", "permits", "building", "zoning", "inspection"],
  "public-works": ["pothole", "road", "street", "snow", "sidewalk", "storm drain"],
  "solid-waste": ["trash", "garbage", "recycling", "refuse", "yard waste", "landfill"],
  "transit": ["bus", "transit", "paratransit"],
  "water-sewer": ["water", "sewer", "utility"],
  "city-aldermen": ["city council", "aldermen", "representative"],
  "city-code-enforcement": ["code", "nuisance", "violation", "blight"],
  "city-finance": ["city budget", "city tax"],
  "city-parks-rec": ["park", "parks", "recreation"],
  "city-permits": ["permit", "permits", "building", "zoning", "inspection"],
  "city-police": ["police", "crime", "non emergency"],
  "city-public-works": ["pothole", "road", "street", "snow", "sidewalk", "storm drain"],
  "city-utility-billing": ["water", "sewer", "utility", "bill", "billing"],
};

const DEPARTMENT_STOP = new Set([
  "about", "and", "city", "county", "department", "for", "frederick", "how", "maryland",
  "number", "office", "official", "phone", "the", "to", "what", "where", "who",
]);

function departmentTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !DEPARTMENT_STOP.has(term));
}

export type DepartmentMatchContext = {
  municipality?: string | null;
};

/** A shared word in a department name is not enough to turn an ordinary
 * discovery request into government help. Require an office/contact action
 * or a clear government service name before department scoring runs. */
export function isDepartmentRequest(query: string): boolean {
  return /\b(?:call|contact|phone|number|office|department|government|who (?:handles|do i call)|where do i (?:report|pay|apply)|report (?:a|an|the)|pay (?:a|my|the)|apply for|permit|inspection|utility bill|trash pickup|recycling pickup|yard waste|pothole|storm drain|code enforcement|animal control|public works|solid waste|parks (?:and|&) recreation|fire (?:and|&) rescue|sheriff(?:'s)? office|health department|county council|city council)\b/i.test(query);
}

/**
 * Match the right office and jurisdiction. Shared names such as Public Works,
 * Parks, Planning, and Utilities must not silently default to whichever row
 * happens to appear first in the data.
 */
export function matchDepartment(
  query: string,
  context: DepartmentMatchContext = {},
): DepartmentContact | null {
  if (!isDepartmentRequest(query)) return null;
  const q = query.toLowerCase();
  const queryTokens = new Set(departmentTokens(q));
  const explicitCounty = /\b(?:frederick\s+)?county\b/.test(q);
  const explicitCity = /\bcity of frederick\b|\bfrederick city\b|\bcity\s+(?:office|government|department|council|permit|trash|water|public works|parks?)\b/.test(q);
  let best: DepartmentContact | null = null, bestScore = 0;
  for (const d of ALL_DEPARTMENTS) {
    if (!d.phone && !d.address) continue; // nothing to offer
    const aliases = DEPARTMENT_ALIASES[d.slug] ?? [];
    const nameTokens = new Set(departmentTokens(`${d.name} ${aliases.join(" ")}`));
    let score = 0;
    for (const term of queryTokens) if (nameTokens.has(term)) score += term.length;
    for (const alias of aliases) if (q.includes(alias)) score += alias.includes(" ") ? 8 : 3;
    if (score === 0) continue;

    if (explicitCounty) score += d.jurisdiction === "county" ? 40 : -40;
    else if (explicitCity) score += d.jurisdiction === "city" ? 40 : -40;
    else if (context.municipality === "frederick") score += d.jurisdiction === "city" ? 8 : 0;
    else if (context.municipality) score += d.jurisdiction === "county" ? 5 : -20;

    if (score > bestScore) { bestScore = score; best = d; }
  }
  return bestScore > 0 ? best : null;
}

export function departmentJurisdictionLabel(department: DepartmentContact): string {
  return department.jurisdiction === "city" ? "City of Frederick" : "Frederick County";
}

export const MAIN_COUNTY_LINE = {
  phone: "301-600-9000",
  address: "Winchester Hall, 12 E. Church St., Frederick, MD 21701",
  hours: "Mon–Fri 8:00 AM – 4:00 PM",
} as const;
