/**
 * Weekly link-health sweep (data brief 4.4: source URL validation).
 *
 * Walks the catalog's outbound links (place websites, the curated event
 * source URLs) on a 7 day cycle, HEAD-checking a rotating slice each run
 * and reporting the dead ones. A 404 on a "Website" or "Source" link
 * breaks the trust premise, so this is the standing watch for it.
 *
 * OFF by default, same contract as the other network crons: no-ops
 * unless LINK_HEALTH_CRON is "1". It makes outbound requests but spends
 * no paid quota, so the flag is about politeness to upstream sites and
 * bounding run time, not cost. The per-run slice is capped.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { PLACES } from "@/data/places";
import { upcomingEvents } from "@/data/events";
import { checkLinks, sliceForCycle } from "@/lib/quality/link-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CYCLE_DAYS = 7;
const SLICE_CAP = 400;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (process.env.LINK_HEALTH_CRON !== "1") {
    return NextResponse.json({
      enabled: false,
      note: "Set LINK_HEALTH_CRON=1 to enable. Off by default to bound outbound traffic.",
    });
  }

  // Build the link set, each tagged so a failure says which record to fix.
  const links = new Map<string, { kind: "place" | "event"; slug: string }>();
  for (const p of PLACES) {
    if (p.website) links.set(p.website, { kind: "place", slug: p.slug });
  }
  for (const e of upcomingEvents(new Date())) {
    if (e.source_url) links.set(e.source_url, { kind: "event", slug: e.slug });
  }

  const today = Math.floor(Date.now() / 86400000) % CYCLE_DAYS;
  const slice = sliceForCycle([...links.keys()], CYCLE_DAYS, today).slice(0, SLICE_CAP);

  const failures = await checkLinks(slice, { concurrency: 8, timeoutMs: 8000 });

  return NextResponse.json({
    enabled: true,
    cycleDay: today,
    checked: slice.length,
    dead: failures.length,
    failures: failures.slice(0, 50).map((f) => ({
      ...f,
      ...(links.get(f.url) ?? {}),
    })),
    note: "Dead place links: fix the website field. Dead event links: the feed item is gone, the next ingest drops it.",
  });
}
