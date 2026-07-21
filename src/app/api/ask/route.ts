import { meterUsage } from "@/lib/usage-meter";
import { NextResponse, after, type NextRequest } from "next/server";
import { askFrederick } from "@/lib/ask/answer";
import { recordSearchMiss } from "@/lib/telemetry/searchMiss";
import { isRateLimited, isSameOriginMutationRequest, readJsonBodyWithLimit } from "@/lib/origin-check";
import { roundCoord } from "@/lib/walkTime";
import { parseScope, resolveDecisionContext, SCOPE_COOKIE } from "@/lib/scope";

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
    ? parsedBody.value as { query?: unknown; scope?: unknown; lat?: unknown; lng?: unknown; taste?: unknown }
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
  const result = await askFrederick(query, {
    origin: context.origin,
    municipality: context.filterMunicipality,
    contextLabel: context.label,
    canShowDistance: context.canShowDistance,
    fallbackReason: context.fallbackReason,
  }, { taste: body.taste });
  if (result.usedModel) meterUsage("anthropic_ask");
  // Configured but nothing real to point at = a data gap, not a config gap.
  if (result.configured !== false && (!result.sources || result.sources.length === 0)) {
    after(() => recordSearchMiss(query, "ask"));
  }
  return NextResponse.json(result);
}
