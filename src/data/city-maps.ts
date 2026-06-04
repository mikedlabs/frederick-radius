/**
 * City of Frederick published PDF maps — catalog + how each is used.
 *
 * Source: cityoffrederickmd.gov/1307/Maps-Apps (18 PDFs, confirmed live
 * 2026-06; all return 200, real PDFs). The binaries (~67 MB total) are
 * NOT committed to git — mirror them to Vercel blob with
 * scripts/download-city-maps.ts and point `blobUrl` at the hosted copy.
 * Until then `sourceUrl` hot-links the City (stable DocumentCenter IDs).
 *
 * `powers` says which app surface each map serves, so they're placed in
 * context (the downtown-parking map on /parking, the path plan on
 * /trails, snow routes in a winter civic card) rather than dumped in a
 * generic "documents" list.
 *
 * NOTE: the richer wins on that page are the INTERACTIVE apps (General
 * Map, Road Closures, Snow Removal, Capital Improvement, Code
 * Enforcement) — they sit on queryable ArcGIS/OpenGov endpoints (same as
 * the parks dashboard). Static PDFs are reference + downloads; the apps
 * are live data. See CITY_INTERACTIVE_APPS below.
 */

const DOC = "https://www.cityoffrederickmd.gov/DocumentCenter/View";

export type CityMapCategory =
  | "reference" | "parking" | "civic" | "property" | "history"
  | "trails" | "transportation" | "winter" | "stormwater" | "ops";

export type CityMap = {
  id: string;
  title: string;
  size: "letter" | "large";
  category: CityMapCategory;
  sourceUrl: string;
  /** Hosted mirror (Vercel blob) once scripts/download-city-maps.ts runs. */
  blobUrl?: string;
  bytes: number;
  /** App surface(s) this map belongs on. */
  powers: string[];
  /** Lower = surface it sooner. */
  priority: 1 | 2 | 3;
};

export const CITY_MAPS: CityMap[] = [
  { id: "downtown-parking", title: "Downtown Parking & Accessibility", size: "letter", category: "parking", sourceUrl: `${DOC}/326/HC_Access`, bytes: 535419, powers: ["/parking"], priority: 1 },
  { id: "snow-emergency-routes", title: "Snow Emergency Routes", size: "large", category: "winter", sourceUrl: `${DOC}/6307/Snow-Emergency-Routes-Map`, bytes: 2178991, powers: ["/parking (tow risk)", "winter civic card"], priority: 1 },
  { id: "street-sweeping", title: "Street Sweeping Schedule", size: "large", category: "winter", sourceUrl: `${DOC}/4259/Streetsweeping`, bytes: 595617, powers: ["/parking", "civic by-address"], priority: 1 },
  { id: "path-plan-letter", title: "Shared-Use Path Plan", size: "letter", category: "trails", sourceUrl: `${DOC}/890/Shared-Use-Path-Plan-Map`, bytes: 2598051, powers: ["/trails", "biking", "radius"], priority: 1 },
  { id: "path-plan-large", title: "Shared-Use Path Plan (Large)", size: "large", category: "trails", sourceUrl: `${DOC}/889/Shared-Use-Path-Plan-Map-Large`, bytes: 5440507, powers: ["/trails"], priority: 2 },
  { id: "historic-district-letter", title: "Historic District", size: "letter", category: "history", sourceUrl: `${DOC}/921/historicLetter`, bytes: 806489, powers: ["/history", "walking tours", "place context"], priority: 1 },
  { id: "historic-district-large", title: "Historic District (Large)", size: "large", category: "history", sourceUrl: `${DOC}/922/historicWall`, bytes: 968151, powers: ["/history"], priority: 2 },
  { id: "zoning", title: "Zoning", size: "large", category: "property", sourceUrl: `${DOC}/1053/zoningWall`, bytes: 4999245, powers: ["place sheet parcel context", "civic"], priority: 2 },
  { id: "future-land-use", title: "Future Land Use", size: "large", category: "property", sourceUrl: `${DOC}/1054/compPlanWall`, bytes: 10944968, powers: ["place sheet parcel context"], priority: 3 },
  { id: "election-districts", title: "Election Districts (2025)", size: "large", category: "civic", sourceUrl: `${DOC}/23830/2025-Election-Districts-Map`, bytes: 2881063, powers: ["who represents me", "voting"], priority: 1 },
  { id: "nac-letter", title: "Neighborhood Advisory Councils", size: "letter", category: "civic", sourceUrl: `${DOC}/845/NacLetter`, bytes: 3716960, powers: ["civic", "place context"], priority: 2 },
  { id: "nac-large", title: "Neighborhood Advisory Councils (Large)", size: "large", category: "civic", sourceUrl: `${DOC}/847/NacWall`, bytes: 6124563, powers: ["civic"], priority: 3 },
  { id: "mobility-district", title: "Mobility District", size: "letter", category: "transportation", sourceUrl: `${DOC}/21530/Mobility-District`, bytes: 1977651, powers: ["/parking", "transit"], priority: 2 },
  { id: "storm-drain-locator", title: "Storm Drain Locator", size: "large", category: "stormwater", sourceUrl: `${DOC}/5430/InletLocator`, bytes: 12546472, powers: ["flooding civic"], priority: 3 },
  { id: "base-letter", title: "Base Map", size: "letter", category: "reference", sourceUrl: `${DOC}/848/baseLetter`, bytes: 2985212, powers: ["reference"], priority: 3 },
  { id: "base-large", title: "Base Map (Large)", size: "large", category: "reference", sourceUrl: `${DOC}/849/baseWall`, bytes: 2470076, powers: ["reference"], priority: 3 },
  { id: "index-map", title: "Index Map", size: "large", category: "reference", sourceUrl: `${DOC}/851/indexWall`, bytes: 3431959, powers: ["reference"], priority: 3 },
  { id: "pavement-condition", title: "Pavement Condition Survey", size: "large", category: "ops", sourceUrl: `${DOC}/4823/ERI_All2`, bytes: 4993664, powers: ["ops (low priority)"], priority: 3 },
];

export const CITY_MAP_BY_ID: Record<string, CityMap> =
  Object.fromEntries(CITY_MAPS.map((m) => [m.id, m]));

/** Maps to surface on a given app route, by `powers` prefix match. */
export const cityMapsFor = (surface: string) =>
  CITY_MAPS.filter((m) => m.powers.some((p) => p.startsWith(surface)))
    .sort((a, b) => a.priority - b.priority);

/**
 * The interactive apps on the same page — the higher-value, queryable
 * follow-ups (each likely sits on an ArcGIS/OpenGov endpoint, like the
 * parks dashboard did). Catalogued so we know what to ingest next.
 */
export const CITY_INTERACTIVE_APPS = [
  { id: "general-map", title: "General Map", url: "https://experience.arcgis.com/experience/b462ea078ec049ebb4d75c5c4da41018", platform: "arcgis" },
  { id: "capital-improvement", title: "Capital Improvement Projects", url: "https://experience.arcgis.com/experience/f056179adba047f2baf375413b50698a", platform: "arcgis" },
  { id: "road-closures", title: "Road Closures", url: "https://maryland.maps.arcgis.com/apps/webappviewer/index.html?id=dd8df89e5d604ea4a8f36cf20cd394ec", platform: "arcgis" },
  { id: "snow-removal", title: "Snow Removal (live)", url: "https://spires.cityoffrederick.com/gis/snowremoval", platform: "spires-gis" },
  { id: "code-enforcement", title: "Code Enforcement", url: "https://stories.opengov.com/frederickmd/published/BRgOy5BBe", platform: "opengov" },
  { id: "development-review", title: "Development Review", url: "https://spires.cityoffrederick.com/cof/developmentreview", platform: "spires" },
  { id: "geodetic-control", title: "Geodetic Control", url: "https://experience.arcgis.com/experience/b86d190dd6ee48c6bc241f1d755db21d/", platform: "arcgis" },
] as const;
