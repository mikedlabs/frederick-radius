/**
 * Field-collected amenities loader — the read side of the /collect tool.
 *
 * A collector walks downtown and drops pins (trash, water, bench, EV,
 * outlet, dog stations, …) via /collect → /api/collect → the
 * `field_amenities` Supabase table. This loader reads the approved rows
 * back and projects them into the SAME `Amenity` shape the static OSM
 * amenities use, so /map merges them into one amenity layer with no
 * special-casing: kind → AMENITY_KIND_TO_CAT → category slug → marker.
 *
 * Fail-soft by construction: no DB configured (local dev without
 * DATABASE_URL) or any query error returns [] — a collected layer that
 * simply has no points, never a thrown render. Rows whose stored kind
 * isn't a recognized AmenityKind are coerced to "other" so a typo in the
 * table can't crash the map; they ride the generic pin.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { field_amenities } from "@/lib/db/schema";
import type { Amenity, AmenityKind } from "@/lib/loaders/amenities";

// The kinds the /collect picker can emit. Kept in sync with the picker
// in src/app/(app)/collect/CollectClient.tsx and AMENITY_KIND_TO_CAT.
const FIELD_KINDS = new Set<AmenityKind>([
  "trash", "recycling", "water", "bench",
  "dog_waste", "dog_water", "outlet", "ev_charging", "restroom", "other",
]);

function coerceKind(raw: string): AmenityKind {
  return FIELD_KINDS.has(raw as AmenityKind) ? (raw as AmenityKind) : "other";
}

/**
 * Approved field-collected amenities as `Amenity[]`. Returns [] when no
 * DB is configured or on any error — the map simply shows no field
 * points rather than failing. Not cached here: /map is already ISR
 * (revalidate 300), so collected pins appear within one revalidation
 * window without a stale cache key to bump.
 */
export async function getFieldAmenities(): Promise<Amenity[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        id: field_amenities.id,
        kind: field_amenities.kind,
        name: field_amenities.name,
        detail: field_amenities.detail,
        note: field_amenities.note,
        municipality: field_amenities.municipality,
        lng: field_amenities.lng,
        lat: field_amenities.lat,
        photo_url: field_amenities.photo_url,
      })
      .from(field_amenities)
      .where(eq(field_amenities.status, "approved"));

    const out: Amenity[] = [];
    for (const r of rows) {
      if (!Number.isFinite(r.lng) || !Number.isFinite(r.lat)) continue;
      const kind = coerceKind(r.kind);
      // The note (collector's free-text, e.g. what an "Other" point is)
      // is the most useful detail; fall back to the stored detail.
      const detail = (r.note ?? r.detail ?? undefined) || undefined;
      out.push({
        // Prefix so a field id can never collide with an OSM/curated id.
        id: `field:${r.id}`,
        kind,
        name: r.name?.trim() || defaultName(kind),
        detail,
        municipality: r.municipality ?? "Frederick County",
        lng: r.lng,
        lat: r.lat,
        photo: r.photo_url ?? undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** A human label when the collector didn't name the point. */
function defaultName(kind: AmenityKind): string {
  switch (kind) {
    case "trash": return "Trash can";
    case "recycling": return "Recycling";
    case "water": return "Water fountain";
    case "bench": return "Bench";
    case "dog_waste": return "Dog waste station";
    case "dog_water": return "Dog water";
    case "outlet": return "Power outlet";
    case "ev_charging": return "EV charging";
    case "restroom": return "Restroom";
    default: return "Marked spot";
  }
}
