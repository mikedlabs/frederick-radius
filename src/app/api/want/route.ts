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
  let origin =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat: roundCoord(lat), lng: roundCoord(lng) }
      : null;
  // No precise fix on the request → seed ranking from the edge IP geo, the
  // exact trick /nearby uses. Ranking only, never a printed distance: the
  // panel shows walk times only for coordinates the CLIENT sent, so a
  // coarse IP centroid can't masquerade as "1 min walk".
  let approximate = false;
  if (!origin) {
    const approx = await approxLocation();
    if (approx.origin) {
      origin = { lat: approx.origin.lat, lng: approx.origin.lng };
      approximate = true;
    }
  }

  if (!c) {
    return NextResponse.json({ error: "c-required" }, { status: 400, headers: noStore });
  }
  const answer = buildWantAnswer(c, facet, origin);
  if (!answer) {
    return NextResponse.json({ error: "unknown-want" }, { status: 400, headers: noStore });
  }
  if (approximate) {
    // IP-seeded ranking: distances are honest only to the ordering, so
    // strip the printed labels (the panel simply omits its distance column).
    const strip = (r: { distance: string | null }) => {
      r.distance = null;
    };
    if (answer.hero) strip(answer.hero);
    answer.also.forEach(strip);
    answer.later.forEach(strip);
    answer.notable.forEach(strip);
  }
  return NextResponse.json(answer, { headers: noStore });
}
