import { NextResponse, type NextRequest } from "next/server";
import { qualifiedSearchIndex } from "@/lib/search/index";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { approxLocation } from "@/lib/ip-geo";
import { roundCoord } from "@/lib/walkTime";
import { resolveDecisionContext, SCOPE_COOKIE } from "@/lib/scope";

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
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 12);
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

  // Rank against the LIVE unified event set, not just the ~30 curated
  // seeds: searching "pride" found nothing while "Pride at the Pubs" led
  // /events (fresh-eyes audit, Jul 2026). The assembly is the same
  // 5-minute-shared cache /today and /events read, so the usual cost
  // here is a cache hit; if it ever fails it degrades to the seeds
  // rather than failing the search.
  const events = await assembleUnifiedEvents(new Date())
    .then((u) => u.publicEvents)
    .catch(() => undefined);
  const latRaw = request.nextUrl.searchParams.get("lat");
  const lngRaw = request.nextUrl.searchParams.get("lng");
  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  const deviceOrigin =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat: roundCoord(lat), lng: roundCoord(lng) }
      : null;
  const approx = await approxLocation();
  const context = resolveDecisionContext({
    scopeRaw: request.cookies.get(SCOPE_COOKIE)?.value ?? null,
    homeMuniRaw: request.cookies.get("fr_home_muni")?.value ?? null,
    deviceOrigin,
    approximateOrigin: approx.origin,
    approximateStatus: approx.status,
  });
  const { results, meta } = qualifiedSearchIndex(q, limit, events, {
    origin: context.origin,
    municipality: context.filterMunicipality,
    contextLabel: context.label,
    fallbackReason: context.fallbackReason,
  });

  return NextResponse.json(
    { results, meta },
    {
      headers: {
        // Scope, device coordinates, and IP approximation can all affect a
        // qualified result. Never let one visitor's "near me" ranking leak
        // through a shared edge cache to another visitor.
        "Cache-Control": "private, no-store",
      },
    },
  );
}
