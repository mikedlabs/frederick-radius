/**
 * MDOT CHART traffic cameras — the same public SHA camera feed FrederickScanner
 * lists in a grid, but pulled with coordinates so we can pin each one on the
 * map (and, next, surface the nearest camera on an incident).
 *
 * Source: the CHARTExportClientService camera map feed (sibling of the event
 * feed in mdot-chart.ts). Shape: { data: [ { id, name, description, lat, lon,
 * commMode, opStatus, publicVideoURL, routeNumber, … } ] }. ~300 cameras
 * statewide; we keep only the ones inside Frederick County (isValidCoord =
 * the real county polygon + straddle buffer) that are actually online.
 *
 * Locations are static, so this is cached long; the live view happens at the
 * publicVideoURL when the user taps a camera. Fail-soft to [] like every feed.
 */
import { unstable_cache } from "next/cache";
import { isValidCoord } from "@/lib/geo";

const ENDPOINT =
  "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getCameraMapDataJSON.do";

export type TrafficCamera = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** CHART live-video page for this camera. */
  videoUrl: string;
  /** Route number for a compact label, when present (70, 270, 15…). */
  route: number | null;
};

type RawCamera = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  lat?: unknown;
  lon?: unknown;
  commMode?: unknown;
  opStatus?: unknown;
  publicVideoURL?: unknown;
  routeNumber?: unknown;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

async function fetchChartCameras(): Promise<TrafficCamera[]> {
  try {
    const res = await fetch(ENDPOINT, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as { data?: RawCamera[] } | null;
    const rows = json?.data;
    if (!Array.isArray(rows)) return [];

    const out: TrafficCamera[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      // Online cameras only — a dead camera is a broken "watch live".
      if (String(r.commMode ?? "").toUpperCase() !== "ONLINE") continue;
      if (String(r.opStatus ?? "").toUpperCase() !== "OK") continue;
      const lng = num(r.lon);
      const lat = num(r.lat);
      if (lng === null || lat === null) continue;
      if (!isValidCoord({ lng, lat })) continue; // in Frederick County only
      const videoUrl = typeof r.publicVideoURL === "string" ? r.publicVideoURL : "";
      if (!videoUrl) continue;
      const id = String(r.id ?? `${lat},${lng}`);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        name: String(r.name ?? r.description ?? "Traffic camera").trim(),
        lng,
        lat,
        videoUrl,
        route: num(r.routeNumber),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Frederick-County CHART cameras, cached ~1h (locations don't move). */
export const getChartCameras = unstable_cache(
  fetchChartCameras,
  ["chart-cameras-v1"],
  { revalidate: 3600, tags: ["chart-cameras"] },
);
