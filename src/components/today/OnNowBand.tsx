import type { ReactNode } from "react";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import HappyHourWallet from "@/components/today/HappyHourWallet";
import TodaysDeals from "@/components/today/TodaysDeals";
import MarketsTodayBeat from "@/components/today/MarketsTodayBeat";
import TonightParkingPlan from "@/components/today/TonightParkingPlan";
import { parkingPlanForToday } from "@/lib/parking-forecast";
import { PARKING_GARAGES } from "@/data/parking-garages";
import { marketsOpenToday } from "@/lib/markets-today";
import { EASTERN_WEEKDAY } from "@/lib/loaders/todaysDeals";
import { getMergedTodaysDeals } from "@/lib/loaders/fieldNotesDb";
import { placesWithFieldHappyHour } from "@/lib/loaders/fieldNotes";
import { parseHappyHour } from "@/lib/happyHour";
import { isClosedNow } from "@/lib/hours";
// eslint-disable-next-line no-restricted-imports -- SERVER component (no "use client"): loader imports render server-side and never enter the client bundle
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { clusterOrder, daypart } from "@/lib/daypart";
import { todayDealAvailability } from "@/lib/today/dealAvailability";
import { isEventToday } from "@/lib/eventWhenLabel";
import { marketTimingAt, todayUtilityBandLabel } from "@/lib/today/on-now";
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { loadOutdoorSafetyHold } from "@/lib/outdoor-safety-live";
import TodaySectionHeading from "@/components/today/TodaySectionHeading";

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/** Count verified happy hours that are live now or still ahead today. */
function happyHourAvailability(now: Date): { currentCount: number; laterCount: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = wd[get("weekday")] ?? 0;
  const min = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  let currentCount = 0;
  let laterCount = 0;
  for (const v of placesWithFieldHappyHour()) {
    const place = clientPlaceBySlug(v.slug);
    if (!place) continue;
    const windows = parseHappyHour(v.happy_hour.schedule).filter((window) => window.days.includes(day));
    const live = windows.some((window) => min >= window.start && min < window.end);
    if (live && !isClosedNow(place.hours, place.hours_verified ?? false, now)) {
      currentCount++;
      continue;
    }
    if (windows.some((window) => window.start > min)) laterCount++;
  }
  return { currentCount, laterCount };
}

/**
 * The current-utility band keeps live offers separate from scheduled items.
 * Its blocks follow the daypart priority and self-hide when they have no useful
 * information left today.
 */
export default async function OnNowBand({
  now,
  eventsPromise,
  marketTeaserAbove = false,
}: {
  now: Date;
  eventsPromise: EventsPromise;
  /** True when the page already teases today's market above the band (the
   *  /today OnNowStrip chip). The band then skips its MarketsTodayBeat line —
   *  and drops markets from its live tally — so one open market is one fact
   *  on the page, not three. */
  marketTeaserAbove?: boolean;
}) {
  // The header uses the same schedules as the cards. A day match alone is not
  // enough to claim that a market or offer is available now.
  const marketsPromise = marketTeaserAbove ? Promise.resolve([]) : marketsOpenToday(now);
  const [{ publicEvents }, scheduledMarkets, deals, hold] = await Promise.all([
    eventsPromise,
    marketsPromise,
    getMergedTodaysDeals(now, Number.MAX_SAFE_INTEGER),
    loadOutdoorSafetyHold(undefined, { now }),
  ]);
  // Markets in this band are outdoor. A published schedule is not permission
  // to promote one during dangerous weather or unhealthy measured air. Other
  // indoor offers remain useful and continue to render.
  const markets = hold ? [] : scheduledMarkets;
  const weekday = EASTERN_WEEKDAY(now);
  const dealTimings = deals.map((deal) => todayDealAvailability(deal.hours, weekday, now));
  const dealCurrentCount = dealTimings.filter((timing) => timing.state === "now").length;
  const dealLaterCount = dealTimings.filter((timing) => timing.state === "later").length;
  const dealTodayCount = dealTimings.filter((timing) => timing.state === "today").length;
  const marketTimings = markets.map((market) => marketTimingAt(market.hours, now));
  const marketCurrentCount = marketTimings.filter((timing) => timing === "now").length;
  const marketLaterCount = marketTimings.filter((timing) => timing === "later").length;
  const marketTodayCount = marketTimings.filter((timing) => timing === "today").length;
  const happy = happyHourAvailability(now);
  const parkingCandidate = parkingPlanForToday(
    publicEvents.map((e) => ({ slug: e.slug, title: e.title, starts_at: e.starts_at, geom: e.geom, category: e.category })),
    PARKING_GARAGES,
    now,
  );
  const parking = parkingCandidate && isEventToday(parkingCandidate.event.starts_at, now)
    ? parkingCandidate
    : null;

  const currentCount = happy.currentCount + dealCurrentCount + marketCurrentCount;
  const laterCount = happy.laterCount + dealLaterCount + marketLaterCount + (parking ? 1 : 0);
  const todayCount = dealTodayCount + marketTodayCount;
  const label = todayUtilityBandLabel({ currentCount, laterCount, todayCount });
  if (!label) return null;

  const hasHappyHour = happy.currentCount + happy.laterCount > 0;
  const hasDeals = dealCurrentCount + dealLaterCount + dealTodayCount > 0;
  const hasMarkets = marketCurrentCount + marketLaterCount + marketTodayCount > 0;
  const blocks: Record<string, ReactNode> = {
    happy: hasHappyHour ? <HappyHourWallet now={now} /> : null,
    deals: hasDeals ? <TodaysDeals now={now} embedded /> : null,
    markets: !marketTeaserAbove && hasMarkets ? <MarketsTodayBeat now={now} /> : null,
    parking: parking ? (
      <TonightParkingPlan
        eventTitle={parking.event.title}
        eventSlug={parking.event.slug}
        eventStartsAt={parking.event.starts_at}
        primaryGarageName={parking.primaryGarage.name}
        alternatives={parking.alternatives}
      />
    ) : null,
  };

  const ordered = clusterOrder(daypart(now))
    .map((key) => ({ key, node: blocks[key] }))
    .filter(({ node }) => node != null);
  if (ordered.length === 0) return null;
  const [lead, ...additional] = ordered;

  return (
    <section className="mt-5" aria-label={label}>
      <TodaySectionHeading
        title={label}
        live={currentCount > 0}
      />
      <div className="space-y-4">
        <div key={lead.key}>{lead.node}</div>
        {/* "Also running today", not "More available today": the page-level
            disclosure at the bottom is already titled "More for today", and
            two near-identical "More …" doors on one page read as the same
            door twice. */}
        {additional.length > 0 ? (
          <CollapsibleSection
            title="Also running today"
            count={additional.length}
            countLabel={additional.length === 1 ? "section" : "sections"}
            storageKey="fr.today.on-now-more"
            defaultOpen={false}
            headingLevel={3}
            className="border-t pt-1 [&>h3>button]:min-h-11"
          >
            <div className="space-y-4 pt-1">
              {additional.map(({ key, node }) => (
                <div key={key}>{node}</div>
              ))}
            </div>
          </CollapsibleSection>
        ) : null}
      </div>
    </section>
  );
}
