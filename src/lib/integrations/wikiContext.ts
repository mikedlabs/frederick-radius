/**
 * "What am I looking at" — nearby Wikipedia context for a coordinate.
 *
 * Frederick is a deeply historic county (Civil War, a National Register
 * historic district, 18th-century churches). The MediaWiki GeoSearch +
 * extracts API returns the Wikipedia articles physically nearest a point,
 * with a one-line intro each. That turns a place page or a landmark tap
 * from "here is a dot" into "the 1,143-seat Weinberg Center, a 1926 movie
 * palace" — real context, at zero cost and no key.
 *
 * This is a CONTEXT layer, not a directory: it never creates places, only
 * annotates a coordinate the app already has. Wikipedia text is CC BY-SA,
 * so every consumer must show attribution. Graceful [] on any failure.
 */
import { haversineMeters } from "@/lib/geo";

export type WikiContext = {
  pageId: number;
  title: string;
  /** Plain-text intro sentence(s), clamped by the API. */
  extract: string;
  /** Canonical article URL. */
  url: string;
  /** Straight-line distance from the query point, meters. */
  distanceM: number;
  lat: number;
  lng: number;
  /** Lead thumbnail, when the article has one. */
  thumbnail?: string;
};

const ENDPOINT = "https://en.wikipedia.org/w/api.php";

/** Build the combined GeoSearch generator + extracts query URL. */
export function wikipediaGeoUrl(
  lat: number,
  lng: number,
  opts: { radiusM?: number; limit?: number; chars?: number } = {},
): string {
  const radius = Math.min(Math.max(opts.radiusM ?? 1000, 10), 10_000);
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 20);
  const chars = opts.chars ?? 200;
  const u = new URL(ENDPOINT);
  u.searchParams.set("action", "query");
  u.searchParams.set("format", "json");
  u.searchParams.set("prop", "coordinates|pageimages|extracts");
  u.searchParams.set("generator", "geosearch");
  u.searchParams.set("ggscoord", `${lat}|${lng}`);
  u.searchParams.set("ggsradius", String(radius));
  u.searchParams.set("ggslimit", String(limit));
  u.searchParams.set("exintro", "1");
  u.searchParams.set("explaintext", "1");
  u.searchParams.set("exchars", String(chars));
  u.searchParams.set("piprop", "thumbnail");
  u.searchParams.set("pithumbsize", "240");
  u.searchParams.set("format", "json");
  return u.toString();
}

type WikiPage = {
  pageid?: number;
  title?: string;
  extract?: string;
  coordinates?: Array<{ lat?: number; lon?: number }>;
  thumbnail?: { source?: string };
};
type WikiResp = { query?: { pages?: Record<string, WikiPage> } };

function articleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/**
 * Pure JSON → sorted context list. Exported for tests. Drops pages missing
 * a coordinate, title, or extract (a stub with no intro helps no one),
 * computes real distance from the query point, and sorts nearest-first.
 */
export function normalizeWikiPages(
  json: unknown,
  from: { lat: number; lng: number },
): WikiContext[] {
  const pages = (json as WikiResp)?.query?.pages;
  if (!pages || typeof pages !== "object") return [];
  const out: WikiContext[] = [];
  for (const p of Object.values(pages)) {
    const coord = p.coordinates?.[0];
    const lat = coord?.lat;
    const lng = coord?.lon;
    const title = typeof p.title === "string" ? p.title.trim() : "";
    const extract = typeof p.extract === "string" ? p.extract.trim() : "";
    if (typeof lat !== "number" || typeof lng !== "number" || !title || !extract) continue;
    out.push({
      pageId: p.pageid ?? 0,
      title,
      extract,
      url: articleUrl(title),
      distanceM: Math.round(haversineMeters(from, { lat, lng })),
      lat,
      lng,
      thumbnail: typeof p.thumbnail?.source === "string" ? p.thumbnail.source : undefined,
    });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * Nearby Wikipedia context for a coordinate. Cached a week (articles move
 * slowly); [] on any failure. Remember CC BY-SA attribution when rendering.
 */
export async function getNearbyWikipedia(
  lat: number,
  lng: number,
  opts: { radiusM?: number; limit?: number } = {},
): Promise<WikiContext[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  try {
    const res = await fetch(wikipediaGeoUrl(lat, lng, opts), {
      headers: { accept: "application/json", "user-agent": "FrederickRadius/1.0 (frederickradius.app)" },
      next: { revalidate: 604_800 },
    });
    if (!res.ok) return [];
    return normalizeWikiPages(await res.json(), { lat, lng });
  } catch {
    return [];
  }
}
