import { NextResponse, after, type NextRequest } from "next/server";
import {
  isLiveEventIndependentMapActionQuery,
  qualifiedSearchIndex,
} from "@/lib/search/index";
import { isEventSearchIntent } from "@/lib/search";
import { recordSearchMiss } from "@/lib/telemetry/searchMiss";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { approxLocation } from "@/lib/ip-geo";
import { roundCoord } from "@/lib/walkTime";
import { resolveDecisionContext, SCOPE_COOKIE } from "@/lib/scope";

function normalizedSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

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

  const latRaw = request.nextUrl.searchParams.get("lat");
  const lngRaw = request.nextUrl.searchParams.get("lng");
  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  const deviceOrigin =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat: roundCoord(lat), lng: roundCoord(lng) }
      : null;
  // The map ranks around the camera the user is looking at. A town/home cookie
  // is useful for global Find, but must not silently override an explicit map
  // origin after someone pans across the county.
  const mapOrigin = request.nextUrl.searchParams.get("origin") === "map" && deviceOrigin;
  const context = mapOrigin
    ? {
        origin: deviceOrigin,
        filterMunicipality: null,
        label: "Current map area",
        fallbackReason: null,
      }
    : await approxLocation().then((approx) => resolveDecisionContext({
        scopeRaw: request.cookies.get(SCOPE_COOKIE)?.value ?? null,
        homeMuniRaw: request.cookies.get("fr_home_muni")?.value ?? null,
        deviceOrigin,
        approximateOrigin: approx.origin,
        approximateStatus: approx.status,
      }));

  const searchContext = {
    origin: context.origin,
    municipality: context.filterMunicipality,
    contextLabel: context.label,
    fallbackReason: context.fallbackReason,
  };
  const base = qualifiedSearchIndex(q, limit, undefined, searchContext);
  const mapRequest = request.nextUrl.searchParams.get("origin") === "map";
  // Most map searches already have a complete answer in Radius's local place
  // and control index. Do not make "coffee nearby" wait for a countywide live
  // calendar. Event-shaped and genuinely unanswered phrases retain the live
  // enrichment path.
  const normalizedQuery = normalizedSearchText(q);
  const qualifiers = base.meta.qualifiers;
  const normalizedQualifiedQuery = normalizedSearchText(
    qualifiers.cleanedQuery,
  );
  const directCategoryRequest = Boolean(
    qualifiers.categoryKey &&
    (
      qualifiers.nearMe ||
      qualifiers.openNow ||
      normalizedQualifiedQuery === normalizedSearchText(qualifiers.categoryKey) ||
      normalizedQualifiedQuery === normalizedSearchText(
        qualifiers.categoryLabel ?? "",
      )
    ),
  );
  const exactEntityAnswer = base.results.some(
    (result) =>
      (result.type === "place" || result.type === "municipality") &&
      normalizedSearchText(result.title) === normalizedQuery,
  );
  const baseAnswersMap =
    isLiveEventIndependentMapActionQuery(q) ||
    Boolean(qualifiers.compoundIntent || qualifiers.strictPlaceKind) ||
    directCategoryRequest ||
    exactEntityAnswer;
  const skipLiveEventAssembly =
    mapRequest && !isEventSearchIntent(q) && baseAnswersMap;
  // Rank against the LIVE unified event set, not just the ~30 curated
  // seeds: searching "pride" found nothing while "Pride at the Pubs" led
  // /events (fresh-eyes audit, Jul 2026). The assembly is the same
  // 5-minute-shared cache /today and /events read, so the usual cost
  // here is a cache hit; if it ever fails it degrades to the seeds
  // rather than failing the search.
  let searchResult = base;
  let liveEventsUnavailable = false;
  if (!skipLiveEventAssembly) {
    if (mapRequest) {
      // Event-shaped map searches deliberately await the owned unified
      // assembly. Its provider work has hard deadlines and cancellation;
      // returning on an independent response timer would leave that work
      // running after the request had already ended.
      try {
        const events = (await assembleUnifiedEvents(new Date())).publicEvents;
        searchResult = qualifiedSearchIndex(
          q,
          limit,
          events,
          searchContext,
        );
      } catch {
        liveEventsUnavailable = true;
      }
    } else {
      const events = await assembleUnifiedEvents(new Date())
        .then((u) => u.publicEvents)
        .catch(() => undefined);
      searchResult = qualifiedSearchIndex(q, limit, events, searchContext);
    }
  }
  const { results, meta } = searchResult;
  const responseMeta = liveEventsUnavailable
    ? { ...meta, liveEventsUnavailable: true }
    : meta;

  if (liveEventsUnavailable && results.length === 0) {
    return NextResponse.json(
      {
        results: [],
        meta: responseMeta,
      },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  // A real query that found nothing is a data gap — bank it after responding.
  if (results.length === 0) {
    after(() => recordSearchMiss(q, "search"));
  }

  return NextResponse.json(
    { results, meta: responseMeta },
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
