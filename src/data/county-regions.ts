export type CountyRegion = "north" | "west" | "east" | "south" | "central";

export const COUNTY_REGION_LABELS: Record<CountyRegion, string> = {
  north: "Northern Frederick County",
  west: "Western Frederick County",
  east: "Eastern Frederick County",
  south: "Southern Frederick County",
  central: "Central Frederick County",
};

export const COUNTY_REGION_MUNICIPALITIES: Record<CountyRegion, readonly string[]> = {
  north: ["thurmont", "emmitsburg", "woodsboro", "walkersville"],
  west: ["middletown", "myersville", "brunswick", "burkittsville", "rosemont"],
  east: ["new-market", "mount-airy"],
  south: ["urbana"],
  central: ["frederick"],
};

const REGION_TERMS: Record<CountyRegion, RegExp> = {
  north: /\b(?:north|northern)\b/i,
  west: /\b(?:west|western)\b/i,
  east: /\b(?:east|eastern)\b/i,
  south: /\b(?:south|southern)\b/i,
  central: /\b(?:central|downtown)\b/i,
};

const DECISION_BREAK = /\b(?:but|however|curious(?:\s+if)?|what about|what (?:are|is)|show me|recommend|suggest|looking for|where should|where can|take me)\b/i;

/** The final request clause carries the desired destination when the user first describes places they already know. */
export function countyDecisionClause(query: string): string {
  const clauses = query.split(DECISION_BREAK).map((clause) => clause.trim()).filter(Boolean);
  return clauses.at(-1) ?? query;
}

export function parseCountyRegions(query: string): CountyRegion[] {
  const decision = countyDecisionClause(query);
  const regions = (Object.keys(REGION_TERMS) as CountyRegion[])
    .filter((region) => REGION_TERMS[region].test(decision));
  // "Downtown" already has a precise search scope. Treat it as central only
  // when the user is explicitly comparing county regions, not in ordinary
  // requests such as "plan a date night downtown."
  return regions.filter((region) => region !== "central" || /\bcentral\b/i.test(decision));
}

export function municipalityMatchesRegions(
  municipality: string | null | undefined,
  regions: readonly CountyRegion[],
): boolean {
  if (regions.length === 0) return true;
  if (!municipality) return false;
  return regions.some((region) => COUNTY_REGION_MUNICIPALITIES[region].includes(municipality));
}

export function regionForMunicipality(municipality: string | null | undefined): CountyRegion | null {
  if (!municipality) return null;
  for (const region of Object.keys(COUNTY_REGION_MUNICIPALITIES) as CountyRegion[]) {
    if (COUNTY_REGION_MUNICIPALITIES[region].includes(municipality)) return region;
  }
  return null;
}

export function countyRegionSummary(regions: readonly CountyRegion[]): string | null {
  if (regions.length === 0) return null;
  if (regions.length === 1) return COUNTY_REGION_LABELS[regions[0]];
  const short = regions.map((region) => region[0].toUpperCase() + region.slice(1));
  return `${short.slice(0, -1).join(", ")} + ${short.at(-1)} Frederick County`;
}
