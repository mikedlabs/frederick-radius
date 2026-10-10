/**
 * /today — Frederick County's dense morning read.
 *
 * NEW ORDER (2026-10-06 rework + visual layer):
 * 1. Conditions line: current weather + high + sunset, plus at most 2 unusual Pulse chips
 * 2. Today's best three events: daytime, evening, free/family spread across towns
 * 3. Tonight: events starting at or after 5 PM
 * 4. Coming up this week: 2-3 anchor events from next 7 days
 * 5. Tools: area picker, Find, Open now / essentials (below the briefing)
 * 6. One seasonal collection that fits the season/day
 * 7. Places: one "Good for this morning/afternoon/evening" block, posted hours
 *
 * Rules:
 * - No duplicate places blocks
 * - No archive photos at the top
 * - Push wrapped-up and online-only events to bottom
 * - Every item keeps existing source/trust labels
 * - Hide empty sections entirely
 * - Conditions line + first event card visible without scrolling on phone
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import TodayListLink from "@/components/today/TodayListLink";
import { easternDayKey } from "@/lib/tz";
import { loadTodayEventSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { eventDecisionVerification } from "@/lib/events/decision-verification";
import { isUtilityEvent } from "@/lib/event-kind";
import { isRoutineProgram } from "@/lib/events/lead-rank";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { leanFromForecast } from "@/lib/today/weatherLean";
import {
  pickBestThree,
  pickTonightEvents,
  pickThisWeekAnchors,
} from "@/lib/today/event-picks";
import TodayConditionsLine from "@/components/today/TodayConditionsLine";
import TodayEventPick from "@/components/today/TodayEventPick";
import TodaySeasonalPick, {
  pickSeasonalCollection,
} from "@/components/today/TodaySeasonalPick";
import DaypartNeeds from "@/components/today/DaypartNeeds";
import { buildDaypartRows } from "@/lib/loaders/daypartPicks";
import CivicAlerts from "@/components/today/CivicAlerts";
import FreshnessGuard from "@/components/today/FreshnessGuard";
import TodayScopeStatus from "@/components/today/TodayScopeStatus";
import { formatEasternDateline } from "@/lib/format/easternClock";
import EventSheetBoundary from "@/components/event/EventSheetBoundary";
import PlaceSheetBoundary from "@/components/place/PlaceSheetBoundary";
import Skeleton from "@/components/ui/Skeleton";
import { Surface } from "@/components/ui/Surface";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import MastheadNotes from "@/components/today/MastheadNotes";
import FromYourSaved from "@/components/today/FromYourSaved";
import TodayLocalGuides, {
  TodayFoodTruckGuide,
} from "@/components/today/TodayLocalGuides";
import TodayAsk from "@/components/today/TodayAsk";
import CravingStrip from "@/components/now/CravingStrip";
import { getStoredFoodTruckSchedule } from "@/lib/food-trucks/schedule-loader";
import { nextPublishedFoodTruckStop } from "@/lib/food-trucks/today-summary";
import { eventHiddenFromToday, eventInstant } from "@/lib/today/event-fields";

export async function generateMetadata(): Promise<Metadata> {
  const day = easternDayKey(new Date());
  const description =
    "Use current conditions and posted listings to decide what to do in Frederick County today.";
  return {
    alternates: { canonical: "/today" },
    title: "Today in Frederick County",
    description,
    openGraph: {
      title: "Today in Frederick County",
      description,
      images: [
        {
          url: `/api/og?type=almanac&day=${day}`,
          width: 1200,
          height: 630,
          alt: `Today in Frederick County for ${day}`,
        },
      ],
    },
  };
}

export const revalidate = 300;

export default async function TodayPage() {
  const now = new Date();

  // Load events (bounded snapshot, same as before)
  const eventsPromise = loadTodayEventSnapshot(now);

  // Load weather for lean detection (for places section)
  const forecastForLean = Promise.race([
    getNwsForecast(FREDERICK_CENTER).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 400)),
  ]);

  return (
    <EventSheetBoundary fetchMissing className="relative">
      <PlaceSheetBoundary fetchMissing>
        {/* Stale-shell guard */}
        <FreshnessGuard renderedAtIso={now.toISOString()} />

        {/* Active civic alerts lead the page */}
        <Suspense fallback={null}>
          <div className="[&:not(:empty)]:mb-4">
            <CivicAlerts compact />
          </div>
        </Suspense>

        {/* Compact identity. Event titles carry the visual primary. */}
        <header className="mb-3">
          <h1
            className="font-sans text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink-2)" }}
          >
            Today in Frederick
          </h1>
          <Suspense fallback={null}>
            <TodayScopeStatus
              dateline={formatEasternDateline(now)}
              controls="status"
            />
          </Suspense>
        </header>

        {/* 1. Conditions line */}
        <Suspense
          fallback={
            <Skeleton.Block
              height={60}
              round="var(--app-radius-md)"
              className="mb-4"
            />
          }
        >
          <TodayConditionsLine />
        </Suspense>

        {/* 2-4. Events first so a phone fold shows conditions + a card. */}
        <Suspense fallback={<EventsSectionsFallback />}>
          <EventsSections eventsPromise={eventsPromise} now={now} />
        </Suspense>

        {/* Tools sit below the briefing, not above the night's picks. */}
        <section
          aria-label="Find a place or service"
          data-surface-row="find"
          className="mt-8 space-y-3"
        >
          <h2
            className="font-sans text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink-2)" }}
          >
            Find a place
          </h2>
          <Suspense fallback={null}>
            <TodayScopeStatus controls="picker" />
          </Suspense>
          <TodayAsk>
            <CravingStrip />
          </TodayAsk>
        </section>

        {/* 5. Seasonal collection pick */}
        <Suspense fallback={null}>
          <SeasonalSection now={now} forecastPromise={forecastForLean} />
        </Suspense>

        {/* 6. Places once. The block hides itself when it has nothing to show. */}
        <Suspense
          fallback={
            <Skeleton.Block
              height={180}
              round="var(--app-radius-md)"
              className="mt-6"
            />
          }
        >
          <PlacesSection now={now} forecastPromise={forecastForLean} />
        </Suspense>

        {/* Secondary context: local guides, saved places */}
        <CollapsibleSection
          title="Local guides and saved places"
          storageKey="fr.today.more-ideas"
          defaultOpen={false}
          headingLevel={2}
          className="today-disclosure mt-8 border-t pt-2 [&>h2>button]:min-h-11"
        >
          <div className="space-y-5">
            <TodayLocalGuides
              foodTruckGuide={
                <Suspense fallback={<TodayFoodTruckGuide />}>
                  <TodayFoodTruckGuideWithSchedule now={now} />
                </Suspense>
              }
            />
            <FromYourSaved />
            <MastheadNotes now={now} />
          </div>
        </CollapsibleSection>
      </PlaceSheetBoundary>
    </EventSheetBoundary>
  );
}

// ─── Event sections ──────────────────────────────────────────────────────

type EventsPromise = ReturnType<typeof loadTodayEventSnapshot>;

function EventsSectionsFallback() {
  return (
    <div className="mt-6 space-y-6">
      <Skeleton.Block height={200} round="var(--app-radius-md)" />
      <Skeleton.Block height={200} round="var(--app-radius-md)" />
    </div>
  );
}

async function EventsSections({
  eventsPromise,
  now,
}: {
  eventsPromise: EventsPromise;
  now: Date;
}) {
  const { publicEvents, sourceHealth } = await eventsPromise;

  // Filter to verified, non-utility, non-routine events for picks
  const pickCandidates = publicEvents.filter(
    (e) =>
      !eventHiddenFromToday(e) &&
      !isUtilityEvent(e) &&
      !isRoutineProgram(e) &&
      eventDecisionVerification(e, now).sourceVerified,
  );

  const bestThree = pickBestThree(pickCandidates, now);
  const tonight = pickTonightEvents(pickCandidates, now);
  const thisWeek = pickThisWeekAnchors(pickCandidates, now);

  // Graceful degradation: if archive is degraded and we have no picks, hide sections
  if (sourceHealth.degraded && bestThree.length === 0 && tonight.length === 0) {
    return (
      <Surface variant="sunken" padding="md" className="mt-6">
        <p className="text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          Today&apos;s event picks are briefly unavailable. The full{" "}
          <Link href="/events" className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
            events calendar
          </Link>{" "}
          remains available.
        </p>
      </Surface>
    );
  }

  return (
    <div className="mt-4 space-y-7">
      {/* Today's best three */}
      {bestThree.length > 0 && (
        <section aria-label="Today's picks">
          <div className="mb-3 flex items-baseline justify-between">
            <h2
              className="font-sans text-[16px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              Events today
            </h2>
            <TodayListLink href="/events" ariaLabel="Open the full events calendar">
              <span className="tabular-nums">{publicEvents.filter((e) => {
                const start = eventInstant(e.starts_at);
                return start ? easternDayKey(start) === easternDayKey(now) : false;
              }).length} total</span>
            </TodayListLink>
          </div>
          <div className="space-y-3">
            {bestThree.map((event, index) => (
              <TodayEventPick
                key={event.slug}
                event={event}
                variant={index === 0 ? "lead" : "compact"}
                now={now}
              />
            ))}
          </div>
          {sourceHealth.degraded && (
            <p className="mt-2 px-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              Partial calendar coverage
            </p>
          )}
        </section>
      )}

      {/* Tonight */}
      {tonight.length > 0 && (
        <section aria-label="Tonight">
          <h2
            className="mb-3 font-sans text-[16px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Tonight
          </h2>
          <div className="space-y-3">
            {tonight.slice(0, 5).map((event, index) => (
              <TodayEventPick
                key={event.slug}
                event={event}
                variant={bestThree.length === 0 && index === 0 ? "lead" : "compact"}
                now={now}
              />
            ))}
          </div>
          {tonight.length > 5 && (
            <TodayListLink href="/events" className="mt-2 px-1">
              +{tonight.length - 5} more tonight
            </TodayListLink>
          )}
        </section>
      )}

      {/* Coming up this week */}
      {thisWeek.length > 0 && (
        <section aria-label="Coming up this week">
          <h2
            className="mb-3 font-sans text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink-2)" }}
          >
            Coming up this week
          </h2>
          <div className="space-y-3">
            {thisWeek.map((event) => (
              <TodayEventPick key={event.slug} event={event} now={now} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Seasonal section ────────────────────────────────────────────────────

async function SeasonalSection({
  now,
  forecastPromise,
}: {
  now: Date;
  forecastPromise: Promise<Awaited<ReturnType<typeof getNwsForecast>>>;
}) {
  const forecast = await forecastPromise;
  const lean = leanFromForecast(forecast, now);
  const collection = pickSeasonalCollection(now, lean);

  if (!collection) return null;

  return <TodaySeasonalPick collection={collection} />;
}

// ─── Places section ──────────────────────────────────────────────────────

async function PlacesSection({
  now,
  forecastPromise,
}: {
  now: Date;
  forecastPromise: Promise<Awaited<ReturnType<typeof getNwsForecast>>>;
}) {
  const forecast = await forecastPromise;
  const lean = leanFromForecast(forecast, now);
  const rows = buildDaypartRows(now, lean);

  // Use existing DaypartNeeds but with "posted hours" note
  return (
    <DaypartNeeds
      rows={rows}
      note="Posted hours may not reflect real-time availability. Check hours before heading out."
      variant="brief"
    />
  );
}

// ─── Food truck helper ───────────────────────────────────────────────────

async function TodayFoodTruckGuideWithSchedule({ now }: { now: Date }) {
  let nextStop: ReturnType<typeof nextPublishedFoodTruckStop> = null;
  try {
    const schedule = await getStoredFoodTruckSchedule(now);
    nextStop = schedule
      ? nextPublishedFoodTruckStop(schedule.stops, now)
      : null;
    if (
      nextStop &&
      easternDayKey(new Date(nextStop.startsAt)) !== easternDayKey(now)
    ) {
      nextStop = null;
    }
  } catch {
    // The immediate roster door remains useful if snapshot unavailable
  }
  return (
    <TodayFoodTruckGuide
      nextFoodTruckStop={nextStop}
      asOf={now.toISOString()}
    />
  );
}
