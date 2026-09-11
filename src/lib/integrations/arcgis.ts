type Feature = {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number; rings?: number[][][] } | null;
};

type QueryResponse = {
  features?: Feature[];
  error?: { message: string };
};

export type ArcGISOutcome = {
  features: Feature[];
  /** False when the service could not be READ. An `ok: true` with zero
   *  features means the service answered and had nothing, which is a
   *  completely different sentence to show a reader. */
  ok: boolean;
};

/**
 * Same query, but the caller learns whether it actually happened.
 *
 * The fail-soft `queryArcGIS` below collapses a refused connection, a non-ok
 * status, an ArcGIS `data.error` payload and a genuine empty result into one
 * `[]`. That is fine for a callsite that only wants rows, and wrong for any
 * surface that tells a person what it knows: /markers rendered "The state and
 * federal history layers aren't answering right now" over a build in which
 * both services had answered fine, because an empty array was the only
 * evidence it had.
 */
export async function queryArcGISOutcome(
  serviceUrl: string,
  params: Record<string, string> = {},
  revalidate = 86400,
): Promise<ArcGISOutcome> {
  const url = buildArcGISQueryUrl(serviceUrl, params);
  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) return { features: [], ok: false };
    const data = (await res.json()) as QueryResponse;
    if (data.error) return { features: [], ok: false };
    return { features: data.features ?? [], ok: true };
  } catch {
    return { features: [], ok: false };
  }
}

function buildArcGISQueryUrl(
  serviceUrl: string,
  params: Record<string, string>,
): string {
  const url = new URL(`${serviceUrl}/query`);
  const defaults: Record<string, string> = {
    where: "1=1",
    outFields: "*",
    f: "json",
    outSR: "4326",
    returnGeometry: "true",
    resultRecordCount: "500",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...params })) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function queryArcGIS(
  serviceUrl: string,
  params: Record<string, string> = {},
  revalidate = 86400,
): Promise<Feature[]> {
  return (await queryArcGISOutcome(serviceUrl, params, revalidate)).features;
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
