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

export const MAIN_COUNTY_LINE = {
  phone: "301-600-9000",
  address: "Winchester Hall, 12 E. Church St., Frederick, MD 21701",
  hours: "Mon–Fri 8:00 AM – 4:00 PM",
} as const;
