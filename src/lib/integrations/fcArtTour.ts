/**
 * Frederick public art tour — runtime integration.
 *
 * The county/city run a public, keyless ArcGIS point layer for the
 * self-guided public art tour (Frederick_Art_Tour). This is a discovery
 * EXPERIENCE (a walkable tour of real murals and sculptures), not a
 * directory list — exactly the north-star content the app wants.
 * Fetched server-side with a weekly revalidate (same pattern as
 * fcTrails/fcParks), normalized to a typed ArtPiece. Graceful []: a
 * feed hiccup never throws into a page, and nothing is fabricated.
 *
 * HONEST SOURCING (confirmed live against the layer, 2026-05):
 *  - Native SR is WKID 2876 (MD State Plane, ftUS); outSR=4326 makes
 *    ArcGIS reproject to WGS84 lon/lat for us (same as the trails and
 *    parks layers that already ship correctly).
 *  - Artist / year / location are not their own clean columns; they
 *    live as free-text DESC1..DESC5 lines like "Artist: Jane Doe",
 *    "Year Dedicated: 2016", "Centennial Park 630 Eighth St." We only
 *    RE-LABEL those real source strings (regex extract) and never
 *    invent a value when the source is silent.
 *  - PIC_URL / THUMB_URL are absolute county-hosted image URLs; kept
 *    only when they are real http(s) links.
 */
import { resolveMunicipality } from "@/lib/connect";

const OUT_FIELDS = [
  "OBJECTID", "NAME", "TAB_NAME", "ARTIST", "SHORT_DESC",
  "DESC1", "DESC2", "DESC3", "DESC4", "DESC5",
  "PIC_URL", "THUMB_URL", "WEBSITE", "Website2",
].join(",");
const ENDPOINT =
  "https://gis.frederickco.gov/arcgis/rest/services/Frederick_Art_Tour/MapServer/0/query" +
  `?where=1%3D1&outFields=${encodeURIComponent(OUT_FIELDS)}` +
  "&outSR=4326&geometryPrecision=5&f=geojson";
const TIMEOUT_MS = 15_000;
// Frederick County bbox [south, west, north, east].
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];

export type ArtPiece = {
  id: string;
  name: string;
  /** Tour grouping, e.g. "Sculptures", "Community Canvas", "Other". */
  category?: string;
  artist?: string;
  /** 4-digit year, parsed from a "Year Dedicated: YYYY" source line. */
  year?: string;
  /** The address/place source line, e.g. "Centennial Park 630 Eighth St." */
  location?: string;
  /** Real remaining descriptive source text (never fabricated). */
  blurb?: string;
  /** Absolute county-hosted image (larger). */
  imageUrl?: string;
  /** Absolute county-hosted thumbnail (card). */
  thumbUrl?: string;
  website?: string;
  municipality: string;
  lng: number;
  lat: number;
};

type ArcFeature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
}
function httpUrl(v: unknown): string | undefined {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
}
// ArcGIS returns OBJECTID as a NUMBER; coerce so dedupe-by-id works.
function idOf(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return str(v);
}
function pointOf(coords: unknown): [number, number] | null {
  if (
    Array.isArray(coords) &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number"
  ) {
    return [coords[0], coords[1]];
  }
  return null;
}

/**
 * Pure: ArcGIS GeoJSON FeatureCollection → ArtPiece[]. Drops nameless,
 * geometry-less, and out-of-county features (never guessed). Parses the
 * free-text DESC lines into artist / year / location WITHOUT inventing
 * anything. Exported for unit tests without the live endpoint.
 */
export function normalizeArt(raw: unknown): ArtPiece[] {
  const feats = (raw as { features?: ArcFeature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const [s, w, n, e] = BBOX;
  const seen = new Set<string>();
  const out: ArtPiece[] = [];

  for (const f of feats) {
    const p = f?.properties ?? {};
    const name = str(p.NAME);
    if (!name) continue;
    if (f?.geometry?.type !== "Point") continue;
    const pt = pointOf(f.geometry.coordinates);
    if (!pt) continue;
    const [lng, lat] = pt;
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const oid = idOf(p.OBJECTID);
    const key = oid ?? `${name}|${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // DESC1..DESC5 are unstructured lines. Re-label real strings only.
    const lines = [p.DESC1, p.DESC2, p.DESC3, p.DESC4, p.DESC5]
      .map((v) => str(v))
      .filter((v): v is string => Boolean(v));

    let year: string | undefined;
    let artistLine: string | undefined;
    const rest: string[] = [];
    for (const ln of lines) {
      const ym = ln.match(/year\s+dedicated\s*:?\s*(\d{4})/i);
      if (ym) {
        year = ym[1];
        continue;
      }
      const am = ln.match(/^\s*artist\s*:\s*(.+)$/i);
      if (am) {
        artistLine = am[1].trim();
        continue;
      }
      rest.push(ln);
    }
    const artist = str(p.ARTIST) ?? artistLine;
    const location = rest.shift(); // first non-artist/year line = place
    const shortDesc = str(p.SHORT_DESC);
    const blurb =
      shortDesc && shortDesc.toLowerCase() !== name.toLowerCase()
        ? shortDesc
        : rest.length > 0
          ? rest.join(" · ")
          : undefined;

    out.push({
      id: `fca-${key}`,
      name,
      category: str(p.TAB_NAME),
      artist,
      year,
      location,
      blurb,
      imageUrl: httpUrl(p.PIC_URL),
      thumbUrl: httpUrl(p.THUMB_URL) ?? httpUrl(p.PIC_URL),
      website: httpUrl(p.WEBSITE) ?? httpUrl(p.Website2),
      municipality: resolveMunicipality({ lng, lat }).municipality.slug,
      lng,
      lat,
    });
  }
  return out;
}

export async function getFrederickArt(): Promise<ArtPiece[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // Public art changes rarely; weekly is plenty and keeps it cheap.
      next: { revalidate: 604800 },
    });
    if (!res.ok) return [];
    return normalizeArt(await res.json());
  } catch {
    return []; // feed hiccup / network — degrade silently, never fabricate
  } finally {
    clearTimeout(timer);
  }
}
