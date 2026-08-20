import { NextResponse, after, type NextRequest } from "next/server";
import {
  isLiveEventIndependentMapActionQuery,
  qualifiedSearchIndex,
} from "@/lib/search/index";
import { isEventSearchIntent } from "@/lib/search";
import { recordSearchMiss } from "@/lib/telemetry/searchMiss";
import {
  loadEventArchiveSnapshot,
  TODAY_EVENT_SNAPSHOT_TIMEOUT_MS,
} from "@/lib/loaders/todayEventSnapshot";
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
  const baseHasAtmHandoff = base.results.some(
    (result) => result.id === "action:map-atm",
  );
  const skipLiveEventAssembly =
    !isEventSearchIntent(q) &&
    ((mapRequest && baseAnswersMap) || baseHasAtmHandoff);
  // Rank against the promoted event archive, not just the small curated seed
  // set. The archive is refreshed in the background and has a cancellable
  // sub-second read budget, so a search can discover current events without
  // starting publisher fan-out in a visitor request.
  let searchResult = base;
  let liveEventsUnavailable = false;
  if (!skipLiveEventAssembly) {
    try {
      // Both Map and global Find use the same durable archive contract. A
      // resolved snapshot may still be degraded because the archive is stale,
      // missing, or timed out; that state is not a healthy empty calendar.
      const snapshot = await loadEventArchiveSnapshot(new Date(), {
        timeoutMs: TODAY_EVENT_SNAPSHOT_TIMEOUT_MS,
      });
      liveEventsUnavailable = snapshot.sourceHealth?.degraded === true;
      searchResult = qualifiedSearchIndex(
        q,
        limit,
        snapshot.publicEvents,
        searchContext,
      );
    } catch {
      liveEventsUnavailable = true;
    }
  }
  // The global ATM action is a handoff into Map's live provider search. Once
  // the request is already coming from Map, returning that same action would
  // route back to /map?q=ATM and prevent AppMap's zero-result fallback from
  // ever running.
  const mapAtmHandoff = mapRequest && baseHasAtmHandoff;
  const results = mapRequest
    ? searchResult.results.filter((result) => result.id !== "action:map-atm")
    : searchResult.results;
  const { meta } = searchResult;
  const responseMeta = liveEventsUnavailable
    ? { ...meta, liveEventsUnavailable: true }
    : meta;

  // A degraded event archive plus an empty result set used to answer 503, and
  // the overlay treats any non-ok as a transport failure: it rendered "Check
  // your connection" over the person's own working connection, with ZERO links
  // out. The honest empty state and the Ask handoff are both gated on a done
  // status, so both were unreachable, and the only real exit was a hint row
  // that is hidden on touch. Three of nine realistic queries hit this.
  //
  // The condition is worth reporting, but it is a caveat on the answer, not a
  // failure of the request. It travels in meta.liveEventsUnavailable, which the
  // client now reads, so the person gets the results we do have plus a plain
  // note that live events are missing from them.
  //
  // Search-miss telemetry stays gated on the archive being healthy: a miss
  // recorded while events are unavailable is not evidence of a data gap.
  if (results.length === 0 && !mapAtmHandoff && !liveEventsUnavailable) {
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
