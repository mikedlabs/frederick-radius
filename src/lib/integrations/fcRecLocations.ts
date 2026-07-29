/**
 * Frederick County Parks & Recreation — amenity locations (runtime).
 *
 * The county publishes a public ArcGIS layer behind its Parks &
 * Recreation Locations dashboard: 203 amenity-level POINTS — parks,
 * playgrounds, athletic fields/courts, shelters, trails, facilities, and
 * the Wegmans Park Passport markers — each with a real photo attachment.
 * Our existing fcParks/fcTrails pull park POLYGONS and trail lines; this
 * fills the amenity gap (what's IN a park) and brings imagery.
 *
 * Fetched server-side with a weekly revalidate (same pattern as
 * fcParks/fcTrails — Vercel reaches ArcGIS even though local CI can't),
 * normalized to a typed RecLocation. Graceful []: a feed hiccup never
 * throws into a page, and nothing is fabricated.
 *
 * HONEST SOURCING NOTES (confirmed live against the layer, 2026-06):
 *  - 203 features; outSR=4326 reprojects to WGS84 lon/lat for us.
 *  - `type` is a clean 7-value domain (Park · Playgrounds · Athletic
 *    Fields / Courts · Park Shelters · Trails · Facilities · Wegmans
 *    Passport Markers) — used directly as our amenity kind.
 *  - hasAttachments=true and EVERY feature carries one image/png photo;
 *    the stable download URL is `<layer>/<objectId>/attachments/<id>`.
 *    We surface that URL with provenance; mirroring to blob is a separate
 *    step (see scripts/ingest-rec-locations.ts).
 * Anonymous readability is not a commercial reuse grant. Runtime and build
 * pulls remain dark until written permission activates this exact source id
 * and specifies attachment-photo reuse.
 */
import { frederickCountySourceEnabled } from "@/lib/integrations/fcCountySource";

const LAYER =
  "https://services5.arcgis.com/o8KSxSzYaulbGcFX/arcgis/rest/services/" +
  "survey123_4590893d5fdc4e6ab6d653f985715200_results/FeatureServer/0";

const OUT_FIELDS = [
  "objectid", "name", "type", "park", "address", "website",
  "difficulty", "trail_length", "paved_trail_length", "nature_trail_length",
  "barrier_free", "structure_capacity", "number_of_tables",
  "fieldcourt_use_type", "style_of_playable_area",
  "passport_difficulty", "passport_features",
].join(",");

const TIMEOUT_MS = 15_000;
// Frederick County bbox [south, west, north, east] — sanity clip.
const BBOX: [number, number, number, number] = [39.20, -77.75, 39.75, -77.15];

/** The 7-value `type` domain → our internal amenity kind. */
export type RecKind =
  | "park" | "playground" | "field" | "shelter"
  | "trail" | "facility" | "passport";

const KIND_BY_TYPE: Record<string, RecKind> = {
  "Park": "park",
  "Playgrounds": "playground",
  "Athletic Fields / Courts": "field",
  "Park Shelters": "shelter",
  "Trails": "trail",
  "Facilities": "facility",
  "Wegmans Passport Markers": "passport",
};

export type RecLocation = {
  id: string;               // stable: "rec-<objectId>"
  objectId: number;
  name: string;
  kind: RecKind;
  rawType: string;
  lat: number;
  lng: number;
  address?: string;
  website?: string;
  /** Parent park name when this is an amenity within a park. */
  park?: string;
  /** Public ArcGIS attachment URL for the feature's photo (image/png). */
  photoUrl?: string;
  // amenity specifics (only set when present)
  difficulty?: string;
  trailLengthMi?: number;
  pavedLengthMi?: number;
  barrierFree?: string;
  capacity?: number;
  tables?: number;
  useType?: string;
  playStyle?: string;
  passportFeatures?: string;
};

type EsriFeature = {
  attributes: Record<string, unknown>;
  geometry?: { x: number; y: number };
};

async function getJson(url: string): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      // Weekly refresh — the county updates this rarely.
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s.toUpperCase() !== "N/A" ? s : undefined;
};

/**
 * Fetch + normalize all amenity locations, each joined to its photo.
 * Returns [] on any failure (never throws into a page).
 */
export async function fetchRecLocations(): Promise<RecLocation[]> {
  if (!frederickCountySourceEnabled("fc_recreation_locations")) return [];
  const featUrl =
    `${LAYER}/query?where=${encodeURIComponent("1=1")}` +
    `&outFields=${encodeURIComponent(OUT_FIELDS)}&returnGeometry=true&outSR=4326&f=json`;
  const data = (await getJson(featUrl)) as { features?: EsriFeature[] } | null;
  if (!data?.features?.length) return [];

  // Bulk-resolve photo attachments: objectId → first image attachment id.
  const ids = data.features
    .map((f) => num(f.attributes.objectid))
    .filter((n): n is number => n != null);
  const photoByOid = await fetchPhotoIds(ids);

  const [s, w, n, e] = BBOX;
  const out: RecLocation[] = [];
  for (const f of data.features) {
    const a = f.attributes;
    const oid = num(a.objectid);
    const g = f.geometry;
    if (oid == null || !g || g.x == null || g.y == null) continue;
    if (g.y < s || g.y > n || g.x < w || g.x > e) continue; // out-of-county guard
    const kind = KIND_BY_TYPE[String(a.type)] ?? "facility";
    const attId = photoByOid.get(oid);
    out.push({
      id: `rec-${oid}`,
      objectId: oid,
      name: str(a.name) ?? "(unnamed)",
      kind,
      rawType: String(a.type ?? ""),
      lat: +g.y.toFixed(6),
      lng: +g.x.toFixed(6),
      address: str(a.address),
      website: str(a.website),
      park: str(a.park),
      photoUrl: attId != null ? `${LAYER}/${oid}/attachments/${attId}` : undefined,
      difficulty: str(a.difficulty) ?? str(a.passport_difficulty),
      trailLengthMi: num(a.trail_length) ?? num(a.paved_trail_length),
      pavedLengthMi: num(a.paved_trail_length),
      barrierFree: str(a.barrier_free),
      capacity: num(a.structure_capacity),
      tables: num(a.number_of_tables),
      useType: str(a.fieldcourt_use_type),
      playStyle: str(a.style_of_playable_area),
      passportFeatures: str(a.passport_features),
    });
  }
  return out;
}

/** Bulk queryAttachments → Map(objectId → first image attachment id). */
async function fetchPhotoIds(objectIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!objectIds.length) return map;
  const url =
    `${LAYER}/queryAttachments?objectIds=${objectIds.join(",")}` +
    `&returnUrl=false&f=json`;
  const data = (await getJson(url)) as {
    attachmentGroups?: { parentObjectId: number; attachmentInfos?: { id: number; contentType?: string }[] }[];
  } | null;
  for (const grp of data?.attachmentGroups ?? []) {
    const img = (grp.attachmentInfos ?? []).find((i) => /image\//.test(i.contentType ?? ""));
    if (img) map.set(grp.parentObjectId, img.id);
  }
  return map;
}
