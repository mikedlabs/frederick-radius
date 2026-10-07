import { NextResponse } from "next/server";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import { selectCountyStatus } from "@/lib/live/countyStatus";
import { getRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligence";
import { getOfficialCivicAlertsSnapshot } from "@/lib/live/officialSignals";

/**
 * /api/pulse/status — the county status for the header indicator and Compass.
 *
 * Reads the shared situation snapshot (NWS alerts, FCPS notices, MDOT CHART
 * incidents, electric outages, privacy-filtered PulsePoint calls, AirNow),
 * MDOT road intelligence, and the official civic alerts, and hands them to
 * selectCountyStatus, the one selector /pulse also uses for its masthead word.
 * The response keeps the legacy header fields and adds the word and items:
 *   - active: boolean — anything worth showing?
 *   - count:  number  — the number of items, after de-duplication
 *   - tone:   "alert" (an Urgent item), "caution" (Advisory items only), or
 *             "quiet" (none)
 *   - ok:     every source answered completely
 *   - word:   "Urgent" | "Advisory" | "All quiet" | "Unknown"
 *   - items:  the graded rows, worst first, each with its /pulse detail link
 *
 * Cached 5 min via Next's revalidate so a polled header indicator
 * doesn't hammer the source feeds. The /pulse page itself uses
 * the same underlying calls with their own cache windows, so the
 * data is consistent across surfaces.
 */
export const revalidate = 300;

export async function GET() {
  const [situation, road, civic] = await Promise.all([
    getCurrentSituationSnapshot(),
    getRoadIntelligenceSnapshot().catch(() => null),
    getOfficialCivicAlertsSnapshot().catch(() => null),
  ]);
  const status = selectCountyStatus({ situation, road, civic });

  return NextResponse.json(
    {
      active: status.count > 0,
      count: status.count,
      tone: status.tone,
      ok: status.ok,
      lastUpdated: status.lastUpdated,
      word: status.word,
      items: status.items,
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
