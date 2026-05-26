/**
 * /api/search
 *
 * Server-side search endpoint that returns SearchResult[] for a query.
 * Replaces the client-side static import of the slim places-client.json
 * (~2.1MB) that SearchOverlay used to ship on every page in the app
 * group (because TopBar is in the app layout).
 *
 * The endpoint is GET-only, cached at the route level so the
 * SearchOverlay's debounced keystrokes hit the function once per
 * unique query in a window and reuse the response across users.
 * The ~2.1MB slim place set never leaves the server.
 *
 * Shape:
 *   GET /api/search?q=carro             -> { results: SearchResult[] }
 *   GET /api/search?q=carro&limit=8     -> ...
 *
 * Empty query returns an empty array.
 */
import type { NextRequest } from "next/server";
import { searchIndex } from "@/lib/search/index";

// Slim CDN-cache so repeated keystrokes ("c", "ca", "car"...) across
// users do not re-rank the whole set every time. Each unique query is
// cached for 5 minutes; longer than typical user dwell, short enough
// that data refreshes within the day.
const CACHE_HEADER = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.max(1, Math.min(50, Number(limitRaw) || 12));

  if (q.trim().length === 0) {
    return Response.json({ results: [] }, { headers: { "Cache-Control": CACHE_HEADER } });
  }

  const results = searchIndex(q, limit);
  return Response.json({ results }, { headers: { "Cache-Control": CACHE_HEADER } });
}
