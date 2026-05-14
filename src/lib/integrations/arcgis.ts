type Feature = {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number; rings?: number[][][] } | null;
};

type QueryResponse = {
  features?: Feature[];
  error?: { message: string };
};

export async function queryArcGIS(
  serviceUrl: string,
  params: Record<string, string> = {},
  revalidate = 86400,
): Promise<Feature[]> {
  const url = new URL(`${serviceUrl}/query`);
  const defaults: Record<string, string> = {
    where: "1=1",
    outFields: "*",
    f: "json",
    outSR: "4326",
    returnGeometry: "true",
    resultRecordCount: "500",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...params })) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), { next: { revalidate } });
    if (!res.ok) return [];
    const data = (await res.json()) as QueryResponse;
    if (data.error) return [];
    return data.features ?? [];
  } catch {
    return [];
  }
}

export type ArcGISPoint = {
  name: string;
  category_slug: string;
  short_blurb: string;
  description?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  municipality_slug?: string;
  lng: number;
  lat: number;
  phone?: string;
  website?: string;
  source: string;
  source_record_id: string;
};

export type ArcGISPolygon = {
  slug: string;
  name: string;
  rings: number[][][];
};

// ──────────────────────────────────────────────────────────────
// Frederick County endpoints
// ──────────────────────────────────────────────────────────────

const FC_SERVICES_BASE =
  "https://maps.frederickcountymd.gov/arcgis/rest/services";

export const FC_LAYERS = {
  parks: `${FC_SERVICES_BASE}/Recreation/Parks/MapServer/0`,
  libraries: `${FC_SERVICES_BASE}/Government/Libraries/MapServer/0`,
  schools: `${FC_SERVICES_BASE}/Government/Schools/MapServer/0`,
  fire_stations: `${FC_SERVICES_BASE}/Government/FireRescue/MapServer/0`,
  municipal_boundaries: `${FC_SERVICES_BASE}/PoliticalBoundaries/Municipalities/MapServer/0`,
} as const;

// Maryland iMAP
export const MD_LAYERS = {
  parcels: "https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0",
  physical_boundaries:
    "https://geodata.md.gov/imap/rest/services/Boundaries/MD_PhysicalBoundaries/FeatureServer/1",
  state_parks:
    "https://geodata.md.gov/imap/rest/services/Recreation/MD_StateParks/MapServer/0",
} as const;

// Try-many helper: ArcGIS layer indices and service names vary.
// If the canonical URL fails, we silently return [] and the seed file
// remains the source of truth for that category.
export async function tryFetchPoints(
  candidates: { url: string; category_slug: string; nameField: string; descField?: string; addressField?: string; cityField?: string; zipField?: string }[],
): Promise<ArcGISPoint[]> {
  const out: ArcGISPoint[] = [];
  for (const c of candidates) {
    const features = await queryArcGIS(c.url);
    for (const f of features) {
      const a = f.attributes;
      const g = f.geometry;
      if (!g || g.x === undefined || g.y === undefined) continue;
      const name = String(a[c.nameField] ?? "").trim();
      if (!name) continue;
      out.push({
        name,
        category_slug: c.category_slug,
        short_blurb: c.descField ? String(a[c.descField] ?? "") : `${name} · Frederick County, MD`,
        address: c.addressField ? String(a[c.addressField] ?? "") || undefined : undefined,
        city: c.cityField ? String(a[c.cityField] ?? "") || undefined : undefined,
        postal_code: c.zipField ? String(a[c.zipField] ?? "") || undefined : undefined,
        lng: g.x,
        lat: g.y,
        source: "arcgis_fcgov",
        source_record_id: String(a.OBJECTID ?? a.objectid ?? `${g.x},${g.y}`),
      });
    }
  }
  return out;
}
