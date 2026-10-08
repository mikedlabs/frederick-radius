import { NextResponse } from "next/server";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import { selectCountyStatus } from "@/lib/live/countyStatus";
import { getRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligence";
import {
  getOfficialCivicAlertsSnapshot,
  getOfficialStormReportsSnapshot,
} from "@/lib/live/officialSignals";
import {
  featuredPoliceRelease,
  getCivicPressReleasesResult,
} from "@/lib/integrations/civic-press";
import { getFrederickWaterSitesWithHistoryResult } from "@/lib/integrations/usgsWater";
import { currentFloodCoverage } from "@/lib/integrations/floodStage";
import { withDeadlineFallback } from "@/lib/promise-deadline";

/**
 * /api/pulse/status — the county status for the header indicator and Compass.
 *
 * Reads the shared situation snapshot (NWS alerts, FCPS notices, MDOT CHART
 * incidents, electric outages, privacy-filtered PulsePoint calls, AirNow),
 * MDOT road intelligence, and the official civic alerts, and hands them to
 * selectCountyStatus, the one selector /pulse also uses for its masthead word.
 * It also reads the evidence /pulse grades on top of those: the river gauges
 * against their NWS flood categories, a fresh urgent police release, and
 * whether the NWS storm reports answered. Without them the header said
 * "Quiet" directly above "Urgent: {release title}." on /pulse.
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

// The same bound /pulse puts on each of these feeds. A miss counts as an
// unanswered check, so the chip says Unknown rather than Quiet.
const PULSE_ONLY_FEED_MS = 6_000;

export async function GET() {
  const [situation, road, civic, press, rivers, stormReports] = await Promise.all([
    getCurrentSituationSnapshot(),
    getRoadIntelligenceSnapshot().catch(() => null),
    getOfficialCivicAlertsSnapshot().catch(() => null),
    withDeadlineFallback(getCivicPressReleasesResult(), PULSE_ONLY_FEED_MS, null),
    withDeadlineFallback(
      getFrederickWaterSitesWithHistoryResult("PT6H"),
      PULSE_ONLY_FEED_MS,
      { data: [], available: false },
    ),
    withDeadlineFallback(getOfficialStormReportsSnapshot(), PULSE_ONLY_FEED_MS, null),
  ]);
  // /pulse judges river freshness and the police window against the
  // situation snapshot's clock, so this does too.
  const now = new Date(situation.generatedAt);
  const flood = currentFloodCoverage(rivers.available, rivers.data, now);
  const status = selectCountyStatus({
    situation,
    road,
    civic,
    pulseOnly: {
      flood: flood.worst,
      police: press ? featuredPoliceRelease(press.items, now.getTime()) : null,
      complete: flood.status === "current" && stormReports?.available === true,
    },
  });

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
