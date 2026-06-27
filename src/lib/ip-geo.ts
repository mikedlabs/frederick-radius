import { headers } from "next/headers";
import { FREDERICK_CENTER, haversineMeters } from "@/lib/geo";

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
 * Honesty guard: if the IP resolves OUTSIDE the county area (> ~60 km from
 * Frederick — an out-of-town visitor, a VPN, a carrier hub far away), we return
 * nothing and the caller keeps the existing "near Downtown" default rather than
 * claim "near San Jose" over a list of Frederick places.
 */
const MAX_DISTANCE_M = 60_000;

export type ApproxLocation = {
  /** Coarse origin for ranking only — never for printed distances. */
  origin: { lng: number; lat: number } | null;
  /** City label for the header ("near Thurmont"), null when out of area. */
  city: string | null;
};

export async function approxLocation(): Promise<ApproxLocation> {
  const h = await headers();
  const lat = Number.parseFloat(h.get("x-vercel-ip-latitude") ?? "");
  const lng = Number.parseFloat(h.get("x-vercel-ip-longitude") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { origin: null, city: null };

  const origin = { lng, lat };
  // Out-of-area (or VPN/carrier hub) → don't seed; keep the Downtown default.
  if (haversineMeters(origin, FREDERICK_CENTER) > MAX_DISTANCE_M) return { origin: null, city: null };

  const rawCity = h.get("x-vercel-ip-city");
  let city: string | null = null;
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity).trim() || null;
    } catch {
      city = rawCity.trim() || null;
    }
  }
  return { origin, city };
}
