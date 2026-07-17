/**
 * Government department directory — City of Frederick + Frederick County
 * + emergency / health lines.
 *
 * Sources
 *   - Department names and URLs verified against the official City of
 *     Frederick and Frederick County department index pages (May 2026).
 *   - Phone numbers only populated where verified from an official .gov
 *     page or a directory entry. Unverified phones are deliberately
 *     omitted (not faked) — the user calls the office via the website.
 *     Fourteen numbers backfilled Jul 2026 from the department-contacts.ts
 *     sweep (each confirmed against the department's own page, 2026-06).
 *   - 911 / 988 / Poison Control are national lines, no source needed.
 *
 * Voice
 *   "about" reads like a resident telling a friend who to call. Plain
 *   sentences, no em dashes, no "team." Same STYLE.md the rest of the
 *   app uses.
 *
 * Phones
 *   Encoded as the canonical `tel:` digit run (e.g. "3016001380") so a
 *   mobile tap-to-call works without further normalization. The UI
 *   formats it as 301-600-1380 at render time.
 */

export type DepartmentContact = {
  /** URL-safe slug, used as the React key and anchor. */
  slug: string;
  /** What jurisdiction owns this line. Drives section grouping. */
  jurisdiction: "city" | "county" | "state" | "emergency";
  /** Display name as a resident would say it. */
  name: string;
  /** One-sentence "call us about" line in resident voice. */
  about: string;
  /** Direct department page or .gov landing. Required. */
  website: string;
  /** Digit-only phone for the `tel:` URI. Optional; omit when not
   *  verified rather than risk a wrong number. */
  phone?: string;
};

/** US phone → display form: "301-600-1380", "1-800-222-1222", "555-1234". */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1"))
    return `1-${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return digits;
}

// ─── Emergency + health ─────────────────────────────────────────────────
// Always at the top. National numbers; no source link other than the
// authoritative agency's website.
const EMERGENCY: DepartmentContact[] = [
  {
    slug: "emergency-911",
    jurisdiction: "emergency",
    name: "Emergency",
    about: "Life-threatening fire, medical, or crime in progress.",
    website: "https://www.911.gov/",
    phone: "911",
  },
  {
    slug: "suicide-crisis-988",
    jurisdiction: "emergency",
    name: "Suicide & Crisis Lifeline",
    about: "Free, confidential support for anyone in crisis or thinking about suicide. 24/7.",
    website: "https://988lifeline.org/",
    phone: "988",
  },
  {
    slug: "poison-control",
    jurisdiction: "emergency",
    name: "Poison Control",
    about: "Someone swallowed, breathed, or got something on their skin. 24/7.",
    website: "https://www.poison.org/",
    phone: "18002221222",
  },
  {
    slug: "frederick-health-hospital",
    jurisdiction: "emergency",
    name: "Frederick Health Hospital",
    about: "The county hospital, on West 7th Street.",
    website: "https://www.frederickhealth.org/",
  },
  {
    // Pets have ERs too, and "animal hospital" names mislead in a crisis
    // (beta-tester safety request, Jul 2026). The in-app guide carries the
    // verified 24/7 ERs, urgent-care hours, and poison lines; no single
    // phone belongs on this row because the right number depends on the
    // tier, which is the guide's whole point.
    slug: "pet-emergency",
    jurisdiction: "emergency",
    name: "Pet emergency",
    about: "The two 24/7 animal ERs, urgent care, and pet poison lines. Verified.",
    website: "/emergency-vet",
  },
];

// ─── City of Frederick ──────────────────────────────────────────────────
const CITY: DepartmentContact[] = [
  {
    slug: "city-frederick-police",
    jurisdiction: "city",
    name: "Frederick Police",
    about: "City police, non-emergency. For active emergencies call 911.",
    website: "https://www.cityoffrederickmd.gov/99/Frederick-Police-Department",
    phone: "3016002101",
  },
  {
    slug: "city-emergency-management",
    jurisdiction: "city",
    name: "Emergency Management",
    about: "Severe weather, evacuations, citywide alerts.",
    website: "https://www.cityoffrederickmd.gov/1669/Emergency-Management",
  },
  {
    slug: "city-public-works",
    jurisdiction: "city",
    name: "Public Works",
    about: "Streets, sidewalks, street trees, flooding, signal outages.",
    website: "https://www.cityoffrederickmd.gov/67/Public-Works",
    // 24-hour DPW switchboard per the official page (verified 2026-07-17;
    // the previously-listed 301-600-1405 appears nowhere on it).
    phone: "3016001440",
  },
  {
    slug: "city-parks-recreation",
    jurisdiction: "city",
    name: "Parks and Recreation",
    about: "City parks, playgrounds, rec programs, ballfield bookings.",
    website: "https://www.cityoffrederickmd.gov/255/Parks-and-Recreation",
  },
  {
    slug: "city-parking",
    jurisdiction: "city",
    name: "Parking",
    about: "Downtown garages, meters, tickets, monthly permits.",
    website: "https://www.cityoffrederickmd.gov/207/Parking",
  },
  {
    slug: "city-code-enforcement",
    jurisdiction: "city",
    name: "Code Enforcement",
    about: "Property maintenance, abandoned vehicles, zoning complaints.",
    website: "https://www.cityoffrederickmd.gov/157/Code-Enforcement",
    phone: "3016003825",
  },
  {
    slug: "city-building-permits",
    jurisdiction: "city",
    name: "Building and Permits",
    about: "Permits, inspections, certificates of occupancy.",
    website: "https://www.cityoffrederickmd.gov/214/Building-Permits",
  },
  {
    slug: "city-planning",
    jurisdiction: "city",
    name: "Planning",
    about: "Land use, historic preservation, comp plan.",
    website: "https://www.cityoffrederickmd.gov/221/Planning",
    phone: "3016001499",
  },
  {
    slug: "city-housing-human-services",
    jurisdiction: "city",
    name: "Housing and Human Services",
    about: "Rental assistance, homeownership help, low-income programs.",
    website: "https://www.cityoffrederickmd.gov/183/Housing-and-Human-Services",
  },
  {
    slug: "city-sustainability",
    jurisdiction: "city",
    name: "Sustainability",
    about: "Climate plan, energy, water conservation, green programs.",
    website: "https://www.cityoffrederickmd.gov/891/Sustainability",
    phone: "3016002843",
  },
  {
    slug: "city-urban-forestry",
    jurisdiction: "city",
    name: "Urban Forestry",
    about: "Street trees, plantings, removal requests.",
    website: "https://www.cityoffrederickmd.gov/529/Urban-Forestry",
  },
  {
    slug: "city-finance",
    jurisdiction: "city",
    name: "Finance",
    about: "City taxes, billing, business licenses.",
    website: "https://www.cityoffrederickmd.gov/193/Finance",
    // Official Finance page number (verified 2026-07-17; 301-600-1166 was wrong).
    phone: "3016001399",
  },
  {
    slug: "city-utility-billing",
    jurisdiction: "city",
    name: "Utility Billing",
    about: "City water and sewer bills.",
    website: "https://www.cityoffrederickmd.gov/107/Contact",
    phone: "3016001421",
  },
  {
    slug: "city-public-affairs",
    jurisdiction: "city",
    name: "Public Affairs",
    about: "Press inquiries, public records, city communications.",
    website: "https://www.cityoffrederickmd.gov/277/Public-Affairs",
    phone: "3016001380",
  },
];

// ─── Frederick County ───────────────────────────────────────────────────
const COUNTY: DepartmentContact[] = [
  {
    slug: "county-main",
    jurisdiction: "county",
    name: "County main line",
    about: "Reach the right county office when you don't know which one.",
    website: "https://www.frederickcountymd.gov/",
    phone: "3016009000",
  },
  {
    slug: "county-executive",
    jurisdiction: "county",
    name: "County Executive",
    about: "The executive office, Winchester Hall.",
    website: "https://frederickcountymd.gov/5931/County-Executive",
    phone: "3016001100",
  },
  {
    slug: "county-sheriff",
    jurisdiction: "county",
    name: "Sheriff's Office",
    about: "County police, non-emergency. For active emergencies call 911.",
    website: "https://www.frederickcosheriff.com/",
    phone: "3016001046",
  },
  {
    slug: "county-fire-rescue",
    jurisdiction: "county",
    name: "Fire and Rescue Services",
    about: "County fire, EMS, water rescue, hazmat. For active emergencies call 911.",
    website: "https://frederickcountymd.gov/24/Division-of-Fire-Rescue-Services-DFRS",
  },
  {
    slug: "county-emergency-management",
    jurisdiction: "county",
    name: "Emergency Management",
    about: "Countywide alerts, severe weather, disaster response.",
    website: "https://frederickcountymd.gov/2001/Emergency-Management",
    phone: "3016006790",
  },
  {
    slug: "county-animal-control",
    jurisdiction: "county",
    name: "Animal Control",
    about: "Stray, injured, or dangerous animals. Adoption and licensing.",
    website: "https://www.frederickcountymd.gov/15/Animal-Control",
    phone: "3016001546",
  },
  {
    slug: "county-health",
    jurisdiction: "county",
    name: "Health Department",
    about: "Vaccines, public health programs, food and water safety.",
    website: "https://health.frederickcountymd.gov/",
    phone: "3016001029",
  },
  {
    slug: "county-solid-waste",
    jurisdiction: "county",
    name: "Solid Waste and Recycling",
    about: "Trash pickup schedules, recycling rules, drop-off sites.",
    website: "https://frederickcountymd.gov/5634/Solid-Waste-and-Recycling",
  },
  {
    slug: "county-water-sewer",
    jurisdiction: "county",
    name: "Water and Sewer Utilities",
    about: "County water and sewer service (not the City of Frederick service).",
    website: "https://frederickcountymd.gov/106/Water-and-Sewer-Utilities",
  },
  {
    slug: "county-transit",
    jurisdiction: "county",
    name: "TransIT Services",
    about: "County buses, routes, schedules, paratransit.",
    website: "https://frederickcountymd.gov/105/Transit-Services",
    phone: "3016002065",
  },
  {
    slug: "county-parks-rec",
    jurisdiction: "county",
    name: "Parks and Recreation",
    about: "County parks, sports leagues, classes, summer camps.",
    website: "https://recreater.com/",
  },
  {
    slug: "county-aging",
    jurisdiction: "county",
    name: "Aging and Independence",
    about: "Older adults, caregivers, senior services, Meals on Wheels.",
    website: "https://www.frederickcountymd.gov/54/Aging-and-Independence",
    phone: "3016001234",
  },
  {
    slug: "county-family-services",
    jurisdiction: "county",
    name: "Family Services",
    about: "Programs for kids and families, child care, supportive services.",
    website: "https://frederickcountymd.gov/16/Family-Services",
    phone: "3016001200",
  },
  {
    slug: "county-planning-permitting",
    jurisdiction: "county",
    name: "Planning and Permitting",
    about: "County zoning, building permits, land use.",
    website: "https://frederickcountymd.gov/8497/Planning-Permitting",
    phone: "3016001153",
  },
  {
    slug: "county-public-works",
    jurisdiction: "county",
    name: "Public Works",
    about: "County roads, drainage, signs, snow removal outside city limits.",
    website: "https://frederickcountymd.gov/19/Public-Works",
    phone: "3016001129",
  },
  {
    slug: "county-housing",
    jurisdiction: "county",
    name: "Housing",
    about: "Housing assistance, fair-housing complaints, rental programs.",
    website: "https://frederickcountymd.gov/6366/Housing",
    phone: "3016001061",
  },
  {
    slug: "county-courts",
    jurisdiction: "county",
    name: "Courts",
    about: "Circuit Court, District Court, jury service, case look-up.",
    website: "https://www.frederickcountymd.gov/2027/Courts",
  },
  {
    slug: "county-council",
    jurisdiction: "county",
    name: "County Council",
    about: "Legislative body, meeting agendas, public comment.",
    website: "https://frederickcountymd.gov/591/County-Council",
    phone: "3016001135",
  },
];

// ─── State of Maryland ──────────────────────────────────────────────────
// State lines residents ask the county app for anyway. Phone verified
// from mva.maryland.gov (July 2026).
const STATE: DepartmentContact[] = [
  {
    slug: "state-mva",
    jurisdiction: "state",
    name: "MVA (Motor Vehicle Administration)",
    about: "Driver's license, vehicle registration, REAL ID, and permits. Book the Frederick branch online.",
    website: "https://mva.maryland.gov/",
    phone: "4107687000",
  },
];

export const DEPARTMENTS: readonly DepartmentContact[] = [
  ...EMERGENCY,
  ...CITY,
  ...COUNTY,
  ...STATE,
];

/**
 * Plain-language → department routing. The answer engine ("ask
 * Frederick") uses this to turn a buried-gov question ("when's
 * recycling", "report a pothole", "dog at large", "building permit")
 * into a direct department answer with a phone + source. Each hint maps
 * everyday words to a substring of the canonical department name.
 */
const DEPT_HINTS: { terms: string[]; match: string }[] = [
  { terms: ["trash", "garbage", "recycl", "refuse", "yard waste", "compost", "bulk", "dump", "landfill"], match: "solid waste" },
  { terms: ["permit", "building", "construction", "zoning", "inspection", "renovat"], match: "permit" },
  { terms: ["pothole", "road", "street", "snow", "plow", "sidewalk", "sign", "drain"], match: "public works" },
  { terms: ["pet", "dog", "cat", "animal", "stray", "leash"], match: "animal control" },
  { terms: ["water", "sewer"], match: "water and sewer" },
  { terms: ["bus", "transit", "ride", "paratransit"], match: "transit" },
  { terms: ["parking", "meter", "garage", "ticket"], match: "parking" },
  { terms: ["tree", "forestry", "branch"], match: "urban forestry" },
  { terms: ["tax", "utility bill", "payment", "billing"], match: "billing" },
  { terms: ["code", "nuisance", "violation", "blight"], match: "code enforcement" },
  { terms: ["police", "crime", "report"], match: "police" },
  { terms: ["fire", "rescue", "ems"], match: "fire and rescue" },
  { terms: ["health", "clinic", "vaccine"], match: "health" },
  { terms: ["senior", "aging", "elder"], match: "aging" },
];

/**
 * Find the department(s) that answer a plain-language query. Direct
 * name/about matches first, then everyday-word hints. Returns [] for
 * very short queries.
 */
export function findDepartments(query: string, limit = 2): DepartmentContact[] {
  const lq = query.toLowerCase().trim();
  if (lq.length < 3) return [];

  const direct = DEPARTMENTS.filter(
    (d) => d.name.toLowerCase().includes(lq) || d.about.toLowerCase().includes(lq),
  );
  // Hint terms match on WORD BOUNDARIES, not raw substrings: "pride"
  // contains "ride", which made a Pride query answer with TransIT buses
  // (fresh-eyes audit, Jul 2026). Single-word hints must equal a query
  // token; multi-word hints still match as phrases.
  const tokens = lq.split(/[^a-z0-9]+/).filter(Boolean);
  const hinted: DepartmentContact[] = [];
  for (const h of DEPT_HINTS) {
    const hit = h.terms.some((t) =>
      t.includes(" ") ? lq.includes(t) : tokens.includes(t),
    );
    if (hit) {
      const d = DEPARTMENTS.find((x) => x.name.toLowerCase().includes(h.match));
      if (d) hinted.push(d);
    }
  }

  const seen = new Set<string>();
  const out: DepartmentContact[] = [];
  for (const d of [...hinted, ...direct]) {
    if (!seen.has(d.slug)) {
      seen.add(d.slug);
      out.push(d);
    }
  }
  return out.slice(0, limit);
}

/** Resident-facing source label for an answer's provenance line. */
export function jurisdictionLabel(j: DepartmentContact["jurisdiction"]): string {
  return j === "city" ? "City of Frederick"
    : j === "county" ? "Frederick County"
    : j === "state" ? "State of Maryland"
    : "Emergency";
}
