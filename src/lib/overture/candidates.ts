/**
 * Overture Places gap-fill — CANDIDATE discovery, never auto-fill.
 *
 * Overture Maps publishes a conflated global places dataset (OSM + Meta +
 * Microsoft) as GeoParquet on S3. Used here to catch POIs the curated set
 * misses in the outer towns (Brunswick, Emmitsburg, Woodsboro, Rosemont) —
 * NOT to write the directory. Per the hand-vetted philosophy, this module
 * only produces a REVIEW QUEUE of places that don't already exist; a human
 * decides what (if anything) gets added.
 *
 * The heavy S3/parquet pull happens offline (see scripts/overture-candidates.ts
 * for the `overturemaps download` command). This module is the pure diff: it
 * normalizes the downloaded GeoJSON and subtracts anything already curated,
 * reusing the app's own isSamePlace dedupe so "new" means the same thing here
 * as everywhere else.
 */
import { isInFrederickCountyArea } from "@/lib/geo";
import { isSamePlace, type DedupeRecord } from "@/lib/dedupe";

export type OvertureCandidate = {
  /** Overture GERS id (stable across releases). */
  id: string;
  name: string;
  /** Overture primary category, e.g. "restaurant", "cafe" (raw, uncleaned). */
  category?: string;
  address?: string;
  /** Best available source tag(s) Overture conflated from (osm, meta, ...). */
  sources?: string;
  lng: number;
  lat: number;
};

/** A GeoJSON feature as emitted by `overturemaps download --type place -f geojson`. */
type OvertureFeature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
}

/**
 * Pull the primary name out of Overture's `names` object (`{ primary, common,
 * rules }`) or the flattened `@name` some exports use.
 */
function primaryName(props: Record<string, unknown>): string | undefined {
  const names = props.names;
  if (names && typeof names === "object") {
    const p = (names as Record<string, unknown>).primary;
    if (typeof p === "string" && p.trim()) return p.trim();
  }
  return str(props["@name"]) ?? str(props.name);
}

function primaryCategory(props: Record<string, unknown>): string | undefined {
  const cats = props.categories;
  if (cats && typeof cats === "object") {
    const p = (cats as Record<string, unknown>).primary;
    if (typeof p === "string" && p.trim()) return p.trim();
  }
  return str(props["@category"]) ?? str(props.category);
}

function firstAddress(props: Record<string, unknown>): string | undefined {
  const addrs = props.addresses;
  if (Array.isArray(addrs) && addrs[0] && typeof addrs[0] === "object") {
    const free = (addrs[0] as Record<string, unknown>).freeform;
    if (typeof free === "string" && free.trim()) return free.trim();
  }
  return str(props.address);
}

function sourceTags(props: Record<string, unknown>): string | undefined {
  const s = props.sources;
  if (Array.isArray(s)) {
    const tags = new Set<string>();
    for (const row of s) {
      const ds = row && typeof row === "object" ? (row as Record<string, unknown>).dataset : undefined;
      if (typeof ds === "string" && ds.trim()) tags.add(ds.trim());
    }
    if (tags.size) return [...tags].join(", ");
  }
  return undefined;
}

/**
 * Pure feature → candidate. Returns null when there's no name, no usable
 * Point coordinate, or the point is outside the Frederick County ring.
 * Exported for tests.
 */
export function normalizeOvertureFeature(f: OvertureFeature): OvertureCandidate | null {
  const props = f.properties ?? {};
  const name = primaryName(props);
  if (!name) return null;

  const coords = f.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords as [number, number];
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!isInFrederickCountyArea(lng, lat)) return null;

  const id = str(props.id) ?? str(props["@id"]) ?? `${lng},${lat}`;
  return {
    id,
    name,
    category: primaryCategory(props),
    address: firstAddress(props),
    sources: sourceTags(props),
    lng,
    lat,
  };
}

/**
 * Subtract the curated set: keep only Overture candidates that don't match
 * any existing place under the app's own isSamePlace rule (proximity + name
 * core). Also self-dedupes Overture rows against each other so two conflated
 * copies of the same POI collapse to one candidate. Returns nearest-name-
 * sorted... no ordering guarantee beyond input order minus matches.
 */
export function findNewCandidates(
  overture: OvertureCandidate[],
  curated: DedupeRecord[],
): OvertureCandidate[] {
  const asRecord = (c: OvertureCandidate): DedupeRecord => ({
    slug: `overture:${c.id}`,
    name: c.name,
    geom: { lng: c.lng, lat: c.lat },
    source: "overture",
  });
  const kept: OvertureCandidate[] = [];
  for (const c of overture) {
    const rec = asRecord(c);
    if (curated.some((p) => isSamePlace(rec, p))) continue; // already have it
    if (kept.some((k) => isSamePlace(rec, asRecord(k)))) continue; // Overture dup
    kept.push(c);
  }
  return kept;
}
