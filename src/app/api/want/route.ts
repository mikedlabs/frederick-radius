/**
 * GET /api/want?c=<craving|meal>&facet=<key>&lat=&lng=
 *
 * The inline answer behind the /today "I want…" strip: the ranked
 * open-now places for one craving, shaped by lib/want-answer (one hero,
 * a short also-open list, a folded opens-later group). Speaks the exact
 * /nearby?c= vocabulary so the two surfaces can never disagree.
 *
 * force-dynamic + no-store on purpose: open_status is computed for THIS
 * request — a cached answer would say "open" after close, the exact bug
 * /nearby exists to avoid. The compute is a local filter + decorate over the
 * matched subset (tens of places), so this route deliberately skips the
 * remote KV rate limiter used by paid-upstream endpoints. Waiting on KV added
 * a network round trip to every tap without protecting a billable resource.
 */
import { NextResponse, type NextRequest } from "next/server";
import { buildWantAnswer } from "@/lib/want-answer";
import { approxLocation } from "@/lib/ip-geo";
import { roundCoord } from "@/lib/walkTime";
import { resolveDecisionContext, SCOPE_COOKIE } from "@/lib/scope";
import { enrichWantAnswerWithWalkingTimes } from "@/lib/want-travel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const c = (p.get("c") ?? "").slice(0, 40);
  const facet = p.get("facet")?.slice(0, 40) || null;
  // Absent params must stay absent: Number(null) is 0, which would silently
  // rank the county from null island. Parse only non-empty strings.
  const latRaw = p.get("lat");
  const lngRaw = p.get("lng");
  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  const deviceOrigin =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat: roundCoord(lat), lng: roundCoord(lng) }
      : null;
  const approx = await approxLocation();
  // The client includes its current scope so the 45-second answer cache keys
  // by it; the validated cookie remains the fallback for direct/API requests.
  const scopeRaw = p.get("scope")?.slice(0, 60) || req.cookies.get(SCOPE_COOKIE)?.value || null;
  const context = resolveDecisionContext({
    scopeRaw,
    homeMuniRaw: req.cookies.get("fr_home_muni")?.value ?? null,
    deviceOrigin,
    approximateOrigin: approx.origin,
    approximateStatus: approx.status,
  });

  if (!c) {
    return NextResponse.json({ error: "c-required" }, { status: 400, headers: noStore });
  }
  let answer = buildWantAnswer(c, facet, context.origin, new Date(), {
    approximateOrigin: context.source !== "device",
    municipality: context.filterMunicipality,
    contextLabel: context.label,
    contextSource: context.source,
    fallbackReason: context.fallbackReason,
  });
  if (!answer) {
    return NextResponse.json({ error: "unknown-want" }, { status: 400, headers: noStore });
  }
  // First paint still has a strict latency budget. A real device fix may
  // refine the already-vetted shortlist with road-network walking times, but
  // a slow/disabled Matrix call falls back to the local answer in 1.4s.
  if (deviceOrigin && context.source === "device" && context.canShowDistance) {
    answer = await enrichWantAnswerWithWalkingTimes(answer, deviceOrigin, {
      timeoutMs: 1_400,
    });
  }
  if (!context.canShowDistance) {
    // Town/home/IP centroids are honest enough to order a list, never to print
    // an exact-looking walk time from a place the visitor is not standing.
    const strip = (r: { distance: string | null }) => {
      r.distance = null;
    };
    if (answer.hero) strip(answer.hero);
    answer.also.forEach(strip);
    answer.open?.forEach(strip);
    answer.later.forEach(strip);
    answer.notable.forEach(strip);
  }
  return NextResponse.json(answer, { headers: noStore });
}
