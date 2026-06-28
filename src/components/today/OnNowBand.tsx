import type { ReactNode } from "react";
import HappyHourWallet from "@/components/today/HappyHourWallet";
import TodaysDeals from "@/components/today/TodaysDeals";
import MarketsTodayBeat from "@/components/today/MarketsTodayBeat";
import TonightParkingPlan from "@/components/today/TonightParkingPlan";
import { parkingPlanForToday } from "@/lib/parking-forecast";
import { PARKING_GARAGES } from "@/data/parking-garages";
import { marketsOpenToday } from "@/lib/markets-today";
import { todaysDeals } from "@/lib/loaders/todaysDeals";
import { placesWithFieldHappyHour } from "@/lib/loaders/fieldNotes";
import { parseHappyHour } from "@/lib/happyHour";
import { clusterOrder, daypart } from "@/lib/daypart";
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/** Count of verified happy hours whose window includes RIGHT NOW (Eastern) —
 *  the same window test HappyHourWallet uses, so the band's "On now" label and
 *  the live cards never disagree. "Between rounds" (next pour) does NOT count as
 *  on-now, which is the honest distinction the band header rides on. */
function liveHappyCount(now: Date): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = wd[get("weekday")] ?? 0;
  const min = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  let n = 0;
  for (const v of placesWithFieldHappyHour()) {
    if (parseHappyHour(v.happy_hour.schedule).some((w) => w.days.includes(day) && min >= w.start && min < w.end)) n++;
  }
  return n;
}

/**
 * OnNowBand — the live layer of /today, gathered under ONE header instead of
 * four free-floating sections. Happy hour, today's verified specials, farmers
 * markets, and tonight's parking play used to stack as separate beats; here they
 * read as a single "what's live" band.
 *
 * Two jobs:
 *   1. CONSOLIDATE — one masthead ("On now" when something's genuinely live,
 *      "Coming up" when the only thing to show is the next happy hour) so the
 *      page stops reading like a stacked dashboard.
 *   2. ORDER BY DAYPART — the blocks reorder with the clock (markets lead the
 *      morning; happy hour + parking lead the evening), so the most useful live
 *      thing is first at 8am vs 9pm. Each block still self-hides, so this is a
 *      priority order, not a promise all four render.
 *
 * Async server component: it reads the same loaders the blocks do (cached, so
 * the re-reads are ~free) to decide the header wording, then renders the blocks
 * in daypart order. Streams in its own Suspense boundary on /today.
 */
export default async function OnNowBand({ now, eventsPromise }: { now: Date; eventsPromise: EventsPromise }) {
  const { publicEvents } = await eventsPromise;

  // Presence, from the EXACT loaders each block uses, so the header never lies.
  const markets = await marketsOpenToday(now);
  const dealsCount = todaysDeals(now).length;
  const happyCount = liveHappyCount(now);
  const parking = parkingPlanForToday(
    publicEvents.map((e) => ({ slug: e.slug, title: e.title, starts_at: e.starts_at, geom: e.geom, category: e.category })),
    PARKING_GARAGES,
    now,
  );

  const liveCount = (happyCount > 0 ? 1 : 0) + (dealsCount > 0 ? 1 : 0) + (markets.length > 0 ? 1 : 0) + (parking ? 1 : 0);
  const anyLive = liveCount > 0;

  // Each block is responsible for its own self-hide; we just place them in
  // daypart order. (HappyHourWallet is the one that nearly always renders —
  // it falls back to the next pour — which is why the header reads "Coming up"
  // when nothing is genuinely on now.)
  const blocks: Record<string, ReactNode> = {
    happy: <HappyHourWallet now={now} />,
    deals: <TodaysDeals now={now} />,
    markets: <MarketsTodayBeat now={now} />,
    parking: parking ? (
      <TonightParkingPlan
        eventTitle={parking.event.title}
        eventSlug={parking.event.slug}
        primaryGarageName={parking.primaryGarage.name}
        alternatives={parking.alternatives}
      />
    ) : null,
  };

  const ordered = clusterOrder(daypart(now)).map((k) => blocks[k]).filter(Boolean);
  if (ordered.length === 0) return null;

  return (
    <section className="mt-5 space-y-3" aria-label="On now">
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-2)" }}>
          {anyLive && (
            <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
          )}
          {anyLive ? "On now" : "Coming up"}
        </h2>
        {/* A quiet live tally, never the headline (brand voice: counts support). */}
        {anyLive && (
          <span className="font-mono text-[10.5px] tabular-nums tracking-[0.04em]" style={{ color: "var(--app-ink-3)" }}>
            {[happyCount > 0 ? `${happyCount} happy hour${happyCount === 1 ? "" : "s"}` : null, dealsCount > 0 ? `${dealsCount} special${dealsCount === 1 ? "" : "s"}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
      <div className="fg-rule" aria-hidden />
      <div className="space-y-4">
        {ordered.map((node, i) => (
          <div key={i}>{node}</div>
        ))}
      </div>
    </section>
  );
}
