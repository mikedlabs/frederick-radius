import { NextResponse } from "next/server";
import { searchIndex } from "@/lib/search/index";

/**
 * GET /api/search?q=<query>&limit=<n>
 *
 * Server-side search so the SearchOverlay client component does NOT
 * have to static-import lib/search.ts → places-client.json (~2MB) into
 * the every-page client bundle. The overlay debounces user input and
 * fetches this endpoint with AbortController.
 *
 * Trust signals (place hours, event provenance) are attached server-
 * side here too, so the overlay no longer needs clientPlaceBySlug or
 * EVENT_BY_SLUG to resolve them.
 *
 * Caching: results vary by query string; a short s-maxage with a
 * longer SWR window lets the edge serve repeat queries instantly while
 * keeping freshness honest. Empty / overlong queries return an empty
 * list and cache aggressively.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit") ?? 12);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(20, Math.floor(limitRaw)))
    : 12;

  // Empty or unreasonably long queries: don't even hit the index. The
  // overlay never sends an empty query, but a misbehaving client could.
  if (q.length === 0 || q.length > 80) {
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  }

  const results = searchIndex(q, limit);

  return NextResponse.json(
    { results },
    {
      headers: {
        // Short s-maxage because the underlying index can change daily
        // (events, hours). The longer SWR window keeps repeat queries
        // fast while the edge revalidates in the background.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
