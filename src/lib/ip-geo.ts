import { headers } from "next/headers";
import { isInFrederickCountyArea } from "@/lib/geo";

/**
 * Approximate location from Vercel's edge geo headers.
 *
 * Vercel attaches `x-vercel-ip-latitude/longitude/city` to every request at the
 * edge (city-level accuracy, free, no client prompt). We use it ONLY to seed a
 * better default for "near me" surfaces before the user grants PRECISE location
 * — a visitor in Thurmont should rank from Thurmont, not always Downtown. It is
 * never used to print a distance (that still requires a real device fix); it
 * only improves the fallback ordering + the "near <town>" label.
 *
 * Honesty guard: if the IP resolves OUTSIDE the real county polygon, we return
 * nothing. A radial distance check admitted Martinsburg and other neighboring
 * towns, producing exact-looking Frederick recommendations from the wrong state.
 */
export type ApproxLocation = {
  /** Coarse origin for ranking only — never for printed distances. */
  origin: { lng: number; lat: number } | null;
  /** City label for the header ("near Thurmont"), null when out of area. */
  city: string | null;
  /** Why there is no origin, so callers can label a county-wide fallback. */
  status: "available" | "missing" | "outside-county";
};

/** Pure normalization kept separate from next/headers for regression tests. */
export function approximateLocationFromValues(
  lat: number,
  lng: number,
  city: string | null,
): ApproxLocation {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { origin: null, city: null, status: "missing" };
  }
  if (!isInFrederickCountyArea(lng, lat)) {
    return { origin: null, city: null, status: "outside-county" };
  }
  return { origin: { lng, lat }, city, status: "available" };
}

export async function approxLocation(): Promise<ApproxLocation> {
  const h = await headers();
  const lat = Number.parseFloat(h.get("x-vercel-ip-latitude") ?? "");
  const lng = Number.parseFloat(h.get("x-vercel-ip-longitude") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { origin: null, city: null, status: "missing" };
  }

  const rawCity = h.get("x-vercel-ip-city");
  let city: string | null = null;
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity).trim() || null;
    } catch {
      city = rawCity.trim() || null;
    }
  }
  return approximateLocationFromValues(lat, lng, city);
}
