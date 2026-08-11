import { meterUsage } from "@/lib/usage-meter";
import { NextResponse, after, type NextRequest } from "next/server";
import { askFrederick } from "@/lib/ask/answer";
import { recordSearchMiss } from "@/lib/telemetry/searchMiss";
import { isRateLimited, isSameOriginMutationRequest, readJsonBodyWithLimit } from "@/lib/origin-check";
import { roundCoord } from "@/lib/walkTime";
import { parseScope, resolveDecisionContext, SCOPE_COOKIE } from "@/lib/scope";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { applyAskOutdoorSafety } from "@/lib/ask/outdoor-safety";
import { isOutdoorRecommendation } from "@/lib/weather-safety";
import { loadOutdoorSafetyHold } from "@/lib/outdoor-safety-live";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getFrederickOutagesResult } from "@/lib/integrations/firstenergy";
import {
  powerOutageAskResult,
  wantsPowerOutage,
} from "@/lib/ask/power-outage";
import {
  publicSafetyActivityAskResult,
  roadStatusAskResult,
  schoolStatusAskResult,
  wantsPublicSafetyActivity,
  wantsRoadStatus,
  wantsCountySnowOperations,
  wantsSchoolStatus,
  wantsWaterAdvisory,
  waterAdvisoryAskResult,
} from "@/lib/ask/civic-status";
import { getFcpsAlertsResult } from "@/lib/integrations/fcps";
import { getCivicPressReleasesResult } from "@/lib/integrations/civic-press";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import {
  selectChartIncidentsResult,
  type CurrentSituationSnapshot,
} from "@/lib/live/currentSituationModel";
import { getRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligence";
import type { RoadIntelligenceSnapshot } from "@/lib/live/roadIntelligenceModel";
import { withAskResponsePresentation } from "@/lib/ask/presentation";
import { enrichAskResultWithTravelTimes } from "@/lib/ask/travel-enrichment";
import {
  getCountySnowRoutes,
  type CountySnowRoute,
} from "@/lib/integrations/fcSnowCommand";
import type {
  CountyDataSnapshot,
} from "@/lib/integrations/fcCountySource";
import {
  countyPlanningAskResult,
  wantsCountyPlanningApplications,
} from "@/lib/ask/county-planning";
import {
  getCountyPlanningApplications,
  type CountyPlanningApplication,
} from "@/lib/integrations/fcPlanningProjects";

const ASK_SAFETY_DEADLINE_MS = 1_500;
const ASK_CIVIC_DEADLINE_MS = 2_000;

async function failSoftWithin<T>(
  promise: Promise<T>,
  fallback: T,
  deadlineMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), deadlineMs);
  });
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      timedOut,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * POST /api/ask  → { configured, answer, sources }
 *
 * The "Ask Frederick" concierge endpoint. Grounded + fail-soft: with no
 * AI key it returns { configured:false } and the UI shows a coming-soon
 * state. Never fabricates — the model only sees retrieved real places.
 *
 * Abuse protection: this is the most expensive route in the app — each
 * call hits a paid LLM — so it carries the same guard the paid Google
 * routes already use. A foreign origin is rejected (cheap hot-link
 * filter), and a per-IP rate limit caps bursts (with a bounded per-instance
 * fallback when distributed KV is unavailable). Without these, an unauthenticated
 * POST loop could run up the AI bill unbounded.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "content_type" }, { status: 415 });
  }
  // 15 questions/min per IP is generous for a human, fatal to a loop.
  if (await isRateLimited(req, "ask", 15, 60)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many questions. Give it a moment." },
      { status: 429 },
    );
  }

  const parsedBody = await readJsonBodyWithLimit(req, 4_096);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.error === "body-too-large" ? 413 : 400 },
    );
  }
  const body = parsedBody.value && typeof parsedBody.value === "object"
    ? parsedBody.value as { query?: unknown; scope?: unknown; lat?: unknown; lng?: unknown; taste?: unknown; fit?: unknown }
    : {};
  const query = typeof body.query === "string" ? body.query.slice(0, 300) : "";
  if (!query.trim()) {
    return NextResponse.json({ error: "query_required" }, { status: 400 });
  }
  const lat = typeof body.lat === "number" ? body.lat : NaN;
  const lng = typeof body.lng === "number" ? body.lng : NaN;
  const deviceOrigin =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat: roundCoord(lat), lng: roundCoord(lng) }
      : null;
  const requestScope = typeof body.scope === "string" ? parseScope(body.scope.slice(0, 60)) : null;
  // Ask must never turn an edge/network estimate into a "near me" answer.
  // IP geolocation is coarse enough to rank Brunswick or south-county places
  // ahead of someone standing downtown. A selected town, a rounded device
  // fix, or the saved home town may rank results; without one, Ask is
  // explicitly countywide and its answer copy says proximity is unavailable.
  const context = resolveDecisionContext({
    scopeRaw: requestScope ?? req.cookies.get(SCOPE_COOKIE)?.value ?? null,
    homeMuniRaw: req.cookies.get("fr_home_muni")?.value ?? null,
    deviceOrigin,
    approximateOrigin: null,
    approximateStatus: "missing",
  });
  if (wantsCountyPlanningApplications(query)) {
    const planning = await failSoftWithin<
      CountyDataSnapshot<CountyPlanningApplication> | null
    >(
      getCountyPlanningApplications(),
      null,
      ASK_CIVIC_DEADLINE_MS,
    );
    return NextResponse.json(
      withAskResponsePresentation(
        countyPlanningAskResult(planning, {
          label: context.label,
          origin: context.origin,
          canShowDistance: context.canShowDistance,
          query,
        }),
        query,
        { kind: "civic" },
      ),
    );
  }
  // Utility status is a direct live-data question. Do not send it through the
  // place catalog or the outdoor-safety rewrite: both can turn "is my power
  // out?" into unrelated businesses or air-quality cards. FirstEnergy's county
  // report cannot resolve a street address, so the answer keeps that limit and
  // hands off to the official outage map.
  if (wantsPowerOutage(query)) {
    const outageResult = await failSoftWithin(
      getFrederickOutagesResult(),
      {
        data: { total_out: 0, total_served: 0, munis: [] },
        available: false,
      },
      ASK_CIVIC_DEADLINE_MS,
    );
    return NextResponse.json(
      withAskResponsePresentation(
        powerOutageAskResult(outageResult, context.label),
        query,
        { kind: "civic" },
      ),
    );
  }
  // Traffic, school, public-safety, and public-water status questions are
  // civic lookups, not discovery prompts. Keep them out of catalog retrieval
  // so a failed official feed never turns into unrelated place cards.
  if (wantsRoadStatus(query)) {
    const now = new Date();
    const [situation, roads, countySnow] = await Promise.all([
      failSoftWithin<CurrentSituationSnapshot | null>(
        getCurrentSituationSnapshot(),
        null,
        ASK_CIVIC_DEADLINE_MS,
      ),
      failSoftWithin<RoadIntelligenceSnapshot | null>(
        getRoadIntelligenceSnapshot(),
        null,
        ASK_CIVIC_DEADLINE_MS,
      ),
      wantsCountySnowOperations(query, now)
        ? failSoftWithin<CountyDataSnapshot<CountySnowRoute> | null>(
            getCountySnowRoutes(now),
            null,
            ASK_CIVIC_DEADLINE_MS,
          )
        : Promise.resolve(null),
    ]);
    const traffic = situation
      ? selectChartIncidentsResult(situation)
      : { data: [], available: false };
    return NextResponse.json(
      withAskResponsePresentation(
        roadStatusAskResult(
          traffic,
          {
            label: context.label,
            origin: context.origin,
            canShowDistance: context.canShowDistance,
            query,
          },
          now,
          roads,
          countySnow,
        ),
        query,
        { kind: "civic" },
      ),
    );
  }
  if (wantsSchoolStatus(query)) {
    const schools = await failSoftWithin(
      getFcpsAlertsResult(),
      { data: [], available: false },
      ASK_CIVIC_DEADLINE_MS,
    );
    return NextResponse.json(
      withAskResponsePresentation(
        schoolStatusAskResult(schools, {
          label: context.label,
        }),
        query,
        { kind: "civic" },
      ),
    );
  }
  if (wantsPublicSafetyActivity(query)) {
    return NextResponse.json(
      withAskResponsePresentation(
        publicSafetyActivityAskResult({
          label: context.label,
        }),
        query,
        { kind: "civic" },
      ),
    );
  }
  if (wantsWaterAdvisory(query)) {
    const notices = await failSoftWithin(
      getCivicPressReleasesResult(),
      {
        items: [],
        sourceHealth: {
          degraded: true,
          unavailable: ["City of Frederick", "Frederick County"],
        },
      },
      ASK_CIVIC_DEADLINE_MS,
    );
    return NextResponse.json(
      withAskResponsePresentation(
        waterAdvisoryAskResult(notices, {
          label: context.label,
        }),
        query,
        { kind: "civic" },
      ),
    );
  }
  // Outdoor safety is a final response constraint, not a suggestion to the
  // model. Load cached NWS alerts and measured AirNow AQI with retrieval,
  // then remove any outdoor answer/source/plan before JSON reaches the client.
  // This prevents a model sentence such as "take the kids to the skate park"
  // from surviving beneath an active thunderstorm or flood warning.
  const [rawResult, hold] = await Promise.all([
    askFrederick(query, {
      origin: context.origin,
      municipality: context.filterMunicipality,
      contextLabel: context.label,
      canShowDistance: context.canShowDistance,
      fallbackReason: context.fallbackReason,
    }, { taste: body.taste, fit: body.fit }),
    // Do not let a slow safety provider recreate Ask's old multi-second wait.
    // The upstream fetches are cached, and a cold miss gets a short final
    // safety budget while the grounded answer is built in parallel.
    loadOutdoorSafetyHold(context.origin ?? FREDERICK_CENTER, {
      deadlineMs: ASK_SAFETY_DEADLINE_MS,
    }),
  ]);
  const safetyResult = applyAskOutdoorSafety(
    rawResult,
    query,
    hold,
    (source) => {
      const place = source.href.startsWith("/places/")
        ? clientPlaceBySlug(source.href.slice("/places/".length))
        : null;
      return isOutdoorRecommendation(place ?? source);
    },
  );
  const routedResult = await enrichAskResultWithTravelTimes(
    safetyResult,
    query,
    context.canShowDistance ? context.origin : null,
    { timeoutMs: 1_800 },
  );
  const result = withAskResponsePresentation(routedResult, query);
  if (result.usedModel) meterUsage("anthropic_ask");
  // Configured but nothing real to point at = a data gap, not a config gap.
  if (result.configured !== false && (!result.sources || result.sources.length === 0)) {
    after(() => recordSearchMiss(query, "ask"));
  }
  return NextResponse.json(result);
}
