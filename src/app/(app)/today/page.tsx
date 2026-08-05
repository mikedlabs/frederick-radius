import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import TodayCard from "@/components/today/TodayCard";
import { ChevronRight } from "lucide-react";
import { easternDayKey } from "@/lib/tz";
import OnNowBand from "@/components/today/OnNowBand";
import KeysScore from "@/components/today/KeysScore";
import LocalSportsScoreboard from "@/components/today/LocalSportsScoreboard";
import SkyHero from "@/components/today/SkyHero";
// AdaptiveGreeting (serif headline like "Sun for now") was removed
// from the SkyHero pre-launch. The temporal anchor (weekday + a live
// clock) now lives in TodayCard inside the SkyHero — without a second
// editorial verdict on top of the weather card's own conditions line.
// (The component itself was deleted in the 2026-08 dead-code sweep;
// it is in git history if we ever want it back.)
import CivicAlerts from "@/components/today/CivicAlerts";
import WeatherNeeds from "@/components/today/WeatherNeeds";
import MomentSpotlight from "@/components/today/MomentSpotlight";
import { activeMoment } from "@/data/civic-moments";
import MastheadNotes from "@/components/today/MastheadNotes";
import DismissibleSection from "@/components/today/DismissibleSection";
import EventCard from "@/components/event/EventCard";
import TonightHeadline from "@/components/today/TonightHeadline";
import PageBloom from "@/components/ui/PageBloom";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import Skeleton from "@/components/ui/Skeleton";
import WeekendPreview from "@/components/today/WeekendPreview";
import FromYourSaved from "@/components/today/FromYourSaved";
// CreekHairline removed in the pleasant-layout pass — it was a
// decorative divider between weather/discovery and action; the
// reorder makes the divider unnecessary.

import { eventDateBlock } from "@/lib/loaders/events";
import { loadTodayEventSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { isUtilityEvent } from "@/lib/event-kind";
import { compareForLead, isRoutineProgram } from "@/lib/events/lead-rank";
import { isValidCoord } from "@/lib/geo";
import { isEventToday, isEventEnded, isEventLiveNow } from "@/lib/eventWhenLabel";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { isSameTodayListing, splitTonightFeature, withoutTodayFeature } from "@/lib/today/tonight";
import PoolsToday from "@/components/today/PoolsToday";
import TodayLocalGuides, { TodayFoodTruckGuide } from "@/components/today/TodayLocalGuides";
import FreshnessGuard from "@/components/today/FreshnessGuard";
import TomorrowPreview from "@/components/today/TomorrowPreview";
import WeatherSafeGoldenHour from "@/components/today/WeatherSafeGoldenHour";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { leanFromForecast, wetWindowEnd } from "@/lib/today/weatherLean";
import EventWalkTime from "@/components/today/EventWalkTime";
import EventSheetBoundary from "@/components/event/EventSheetBoundary";
import TodayAsk from "@/components/today/TodayAsk";
import { todayFrame } from "@/lib/today/masthead";
import { formatEasternDateline } from "@/lib/format/easternClock";
import DaypartNeeds from "@/components/today/DaypartNeeds";
import CravingStrip from "@/components/now/CravingStrip";
import BrowsePlacesDisclosure from "@/components/today/BrowsePlacesDisclosure";
import { buildDaypartRows } from "@/lib/loaders/daypartPicks";
import PageChapter from "@/components/ui/PageChapter";
import { getStoredFoodTruckSchedule } from "@/lib/food-trucks/schedule-loader";
import { nextPublishedFoodTruckStop } from "@/lib/food-trucks/today-summary";
import { shouldPromoteTodayHeadliner } from "@/components/today/headlinerTiming";
import TodayScopeStatus from "@/components/today/TodayScopeStatus";
import { shouldRenderTodayEventSection } from "@/lib/today-events";

/**
 * Now — the daily briefing.
 *
 * Spine (top to bottom — matches the render below):
 *
 *   1. SkyHero        → time-of-day sky + date, clock, and weather
 *   2. Decision lead  → the location-aware open-place shelf, which is the
 *                       first Today answer that follows the shared town lens
 *   3. Ask / Browse   → secondary routes for a more specific need
 *   4. What's on      → a qualified event feature + today's public program
 *   5. Available      → scheduled local utilities and tomorrow's next move
 *   6. More           → secondary local guides and saved places, collapsed
 *
 * (The old generated "best move now" card was removed 2026-06-18 because it
 *  promoted ideas without enough evidence. Today may recommend carefully when
 *  time, distance, availability, conditions, and source confidence support the
 *  choice. It must explain the reason and stay quiet on low-confidence days.)
 *
 * What got cut in this pass:
 *   • Answers lead (AnswerCards) — the section only ever rendered the
 *                                  "On tonight" card (open-now + weekend
 *                                  answers were already removed); the
 *                                  event lead now lives in What's on.
 *   • RightNowStrip (On deck)    — overlapped the Upcoming events
 *                                  section and TimeToggle below
 *   • PrimaryActionCard (Plan)   — overlapped MoreSheet's Plan tool
 *
 * What got cut in earlier passes (preserved here for archeology):
 *   • LocalNewsStrip   — news belongs on its own surface, not the briefing
 *   • HistoryPulse     — editorial filler; one rotating fact ≠ daily utility
 *   • FromAboveTile    — the photography book has its own home (kept the
 *                        FromAboveCta footer)
 *   • HiddenSectionsBar — managing hidden sections is a feature for a page
 *                        that has too many; a page with 7 sections doesn't
 *   • The /discover crosslink + "More around Frederick" divider
 *   • Hidden Frederick footer doors
 *   • StatStrip "Across Frederick County"  — generic counts, no signal
 *   • PhotoMosaic "Looks like Frederick"   — pretty but redundant
 *   • RedditPulse                          — noisy subreddit posts
 *   • MunicipalityStrip                    — towns reachable via /m
 *   • DecorativeDivider variants           — visual filler
 */
// generateMetadata (not a static object) so the share card is the DAILY
// almanac card: the Eastern day is baked into the image URL, which makes
// each day a distinct URL — social caches can never serve yesterday's
// "today". Regenerates on the page's own ISR cadence (300s), so the URL
// rolls over within minutes of midnight Eastern.
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
          alt: `The Frederick County almanac for ${day}`,
        },
      ],
    },
  };
}


// Event lead selection lives in src/lib/today/tonight so Today surfaces one
// agreed headliner and removes duplicate feed occurrences from the rows below.

// /today is time-sensitive, but force-dynamic made every visit pay the
// external-feed fanout (a ~7-10s cold load — the sims caught it). Instead:
// ISR every 5 minutes, so the page serves cached + fast while the event
// groupings stay fresh-enough, and the *visible* clock is handled live,
// client-side, by LiveClock inside TodayCard. (The original bug was pure-static
// with NO revalidate — a frozen build-time date; a short revalidate plus
// the live client clock fixes that without the per-request cost.)
export const revalidate = 300;

export default async function HomePage() {
  const now = new Date();

  // ONE bounded snapshot read, created here but intentionally NOT awaited.
  // The expensive live-feed fan-out belongs to the warm/archive crons, never a
  // visitor request. Suspense can stream UI, but it cannot end a serverless
  // invocation while an async subtree is still working; starting the live
  // assembly here therefore let one pathological feed parser hold /today open
  // for the full 300-second platform timeout. The durable archive is the
  // last-known-good copy of that same unified set. Its read cancels after
  // 650ms, falls back to curated rows, and carries an honest degraded signal.
  const eventsPromise = loadTodayEventSnapshot(now);

  // WEATHER-CONDITIONAL COMPOSITION — a wet hour leads the daypart shelf with
  // indoor picks; a 92°+ hour adds cool-down picks. Start the cached NWS read
  // now, but do not await it in the page root. The ordinary shelf is the
  // immediate Suspense fallback and the weather-aware ordering streams within
  // 400ms, so a slow provider cannot delay the document shell or masthead.
  const forecastForLean = Promise.race([
    getNwsForecast(FREDERICK_CENTER).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 400)),
  ]);
  const baseDaypartRows = buildDaypartRows(now, null);

  // Keep the location-aware answer mounted on every render. LocationChip's
  // shared town lens is applied by DaypartNeeds through /api/want; replacing
  // this component with an event headline made a town change look completely
  // inert on any day with a promoted draw. Events still get their editorial
  // feature, but inside the explicitly countywide What's-on program below.
  const decisionLead = (
    <Suspense fallback={<OpenPlaceLead rows={baseDaypartRows} note={null} />}>
      <WeatherAwareOpenPlaceLead
        now={now}
        baseRows={baseDaypartRows}
        forecastPromise={forecastForLean}
      />
    </Suspense>
  );

  // These are useful today, but not all of them are live: a first pitch,
  // published special, market, or parking plan may still be hours away. Keep
  // them out of the first decision slot so it remains one honest answer.
  const availableToday = (
    <>
      <div className="today-sports-stack">
        <h2 className="today-sports-stack__heading">Local sports</h2>
        <KeysScore />
        <LocalSportsScoreboard />
      </div>
      <div id="on-now" style={{ scrollMarginTop: "calc(var(--app-topbar-h, 56px) + 12px)" }}>
        <Suspense fallback={null}>
          <OnNowBand now={now} eventsPromise={eventsPromise} />
        </Suspense>
      </div>
    </>
  );

  // The event program streams inside its own Suspense boundary.
  const whatsOn = (
    <div id="whats-on" style={{ scrollMarginTop: "calc(var(--app-topbar-h, 56px) + 12px)" }}>
      <Suspense
        fallback={
          <section className="mt-5 space-y-3" aria-label="Events today" aria-busy="true">
            <span className="sr-only" role="status">Loading today&rsquo;s events.</span>
            <Skeleton.Block height={220} round="var(--app-radius-lg)" />
          </section>
        }
      >
        <WhatsOn eventsPromise={eventsPromise} now={now} />
      </Suspense>
    </div>
  );

  return (
    // Sheet boundary in lean-surface mode: today's rails deliberately keep
    // the event corpus out of the client payload, so a tap on any event
    // link opens the sheet on a skeleton and fetches just that event.
    // Real anchors, SEO, and modified clicks all pass through untouched.
    <EventSheetBoundary fetchMissing className="relative">
      <PageBloom motif />

      {/* Stale-shell guard (June-9 review P0): a cached SW/CDN shell can
          present a days-old render as "Right now." The client compares the
          render day with the device day — silently reloads once, then
          shows an honest "this page is from {day}" banner. Fresh pages
          render nothing. */}
      <FreshnessGuard renderedAtIso={now.toISOString()} />

      {/* ── HEADS UP — an ACTIVE civic alert (NWS/NPS: warning, closure,
          incident) LEADS the entire page (owner call: alerts before the
          header). It's the one thing that changes whether anything else on the
          page matters, so nothing — not even the weather hero — sits above it.
          Self-hides when nothing is active (the common case), and the
          :not(:empty) wrapper means it then costs the ordinary day zero space:
          no phantom gap above the sky hero. */}
      <Suspense fallback={null}>
        <div className="[&:not(:empty)]:mb-4">
          <CivicAlerts />
        </div>
      </Suspense>

      {/* ── WEATHER NEEDS — the "what to do" layer that appears ONLY during an
          active weather warning (storm, snow, flood, heat). The banner above is
          the alarm; this is the calm safety line plus the actions (river levels,
          live outage/road board, official closings, the numbers). Self-hides
          when nothing is active, so it costs the ordinary day zero space. */}
      <Suspense fallback={null}>
        <div className="[&:not(:empty)]:mb-4">
          <WeatherNeeds />
        </div>
      </Suspense>

      {/* ── MOMENT SPOTLIGHT — the big civic weekend (the Fourth, the Fair, the
          holiday markets). Festive, not alarm-toned; self-hides outside a
          moment's date window; dismissible for the session. */}
      {activeMoment(now) && (
        <div className="mb-4">
          <MomentSpotlight moment={activeMoment(now)!} />
        </div>
      )}

      {/* ── TITLE — a TIME-AWARE masthead (owner call, 2026-07-20: make /today
          "time-aware"). The page already reorders itself across the day (the
          evening gear below flips the lead to tonight at 17:00), but the title
          used to read a static "Today in Frederick" at every hour, so the shift
          was invisible. The h1 + one-line frame now change with the Eastern
          daypart (todayFrame, pinned to the same 17:00 boundary), so the page
          NAMES the moment it is leading with. Server-computed on the Eastern
          clock; the page ISRs every 300s so a boundary rolls within minutes.
          This is the real document h1. Sits below an active civic alert (alerts
          still lead) and above the weather. */}
      {(() => {
        const frame = todayFrame(easternStartHour(now.toISOString()));
        return (
          <header className="mb-3 px-0.5">
            {/* The page title, at page-title size. At 22px it sat two pixels
                above its own 20px section headings, so the masthead read as
                just another section. 30/32 restores the ladder: page over
                section over row, with typography carrying the hierarchy
                (brand rule) instead of the deleted brick dash. The date now
                rides the scope line below — one supporting line instead of a
                decorated eyebrow above the title. */}
            <h1 className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight sm:text-[32px]" style={{ color: "var(--app-ink)" }}>
              {frame.title}
            </h1>
            <TodayScopeStatus dateline={formatEasternDateline(now)} />
          </header>
        );
      })()}

      {/* ── WEATHER HERO — the time-of-day gradient sky and today's weather
          lead the page. Now a COMPACT, CONTAINED card (owner
          call: "all cards within the main part" + "one header with the weather
          more compact") — the sky is a rounded card within the column rather
          than a full-bleed band, with a tighter weather row inside; the soft
          downward shadow floats it over the page. The detailed hourly / 7-day
          / almanac forecast still lives in the collapsed "full briefing". */}
      {/* shader-rim — the page's ONE rationed living treatment: a slow, barely-
          there conic accent ring on the true top-of-page hero (the sky plate),
          the crafted-product-hero move the primitive reserves for a single
          element. It freezes under prefers-reduced-motion. (The old className
          shadow was dead — the .sky-hero rule's own inset shadow overrides it.) */}
      {/* The whole weather plate is a door to the full forecast (July 2026
          Reddit review: it looked tappable and wasn't — now it is, with the
          standard right-edge disclosure chevron). */}
      <SkyHero className="relative z-10">
        <Link
          href="/pulse?open=weather"
          prefetch={false}
          className="group relative block outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <Suspense fallback={<Skeleton.Block height={110} round="var(--app-radius-md)" />}>
            <TodayCard />
          </Suspense>
          <span className="sr-only">Open the full forecast.</span>
          <ChevronRight
            aria-hidden
            strokeWidth={2.25}
            className="absolute bottom-2 right-2 h-4 w-4 opacity-50 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </SkyHero>

      {/* One town-aware first move. It stays mounted so a LocationChip change
          immediately re-ranks this answer instead of only changing the chip. */}
      {decisionLead}

      {/* One decision index: ask a specific question or open the category
          browse. The rows share a surface so they read as two routes through
          the same job, not two unrelated cards competing below the weather. */}
      <div
        role="group"
        aria-label="Find what you need"
        className="mt-3 overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <TodayAsk embedded />
        <BrowsePlacesDisclosure embedded>
          <CravingStrip />
        </BrowsePlacesDisclosure>
      </div>

      {/* The day's chronological program belongs before sports and specials.
          This is the first substantive briefing after the one decision lead
          and the two direct find routes. WhatsOn already owns its visible
          heading, so an extra chapter label would spend another row on a
          phone. */}
      {whatsOn}

      {/* Scheduled utilities stay useful without pretending to be live. */}
      <PageChapter
        label="Available today"
        tone="civic"
        variant="plain"
        className="mt-5"
      >
        {availableToday}

        {/* A forward answer for the night owl. Self-hides during the day; once
            the current day is nearly spent it offers one tomorrow move. */}
        <Suspense fallback={null}>
          <TomorrowPreview now={now} eventsPromise={eventsPromise} />
        </Suspense>
      </PageChapter>

      <Suspense fallback={null}>
        <WeatherSafeGoldenHour now={now} />
      </Suspense>

      {/* Secondary doors share one deliberate reveal. The old lower page also
          repeated generated collections, a rotating place list, and a taste
          nudge; those made the briefing feel endless without improving the
          immediate decision. Their dedicated routes remain available. */}
      <CollapsibleSection
        title="More for today"
        storageKey="fr.today.more-ideas"
        defaultOpen={false}
        headingLevel={2}
        className="today-disclosure mt-6 border-t pt-2 [&>h2>button]:min-h-11"
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
          <Suspense fallback={null}>
            <WeekendPreview now={now} eventsPromise={eventsPromise} />
          </Suspense>
          <Suspense fallback={null}>
            <PoolsToday now={now} />
          </Suspense>
          <MastheadNotes now={now} />
        </div>
      </CollapsibleSection>
    </EventSheetBoundary>
  );
}

// ─── Event-dependent slices ──────────────────────────────────────────────
// Thin async server components that each await the ONE shared events promise
// and render an existing leaf component with its existing props. Moving the
// await + derivation off HomePage into these <Suspense>-bounded children is
// what lets the static chrome paint before the feeds resolve.

type EventsPromise = ReturnType<typeof loadTodayEventSnapshot>;
type DaypartRows = ReturnType<typeof buildDaypartRows>;

/** The non-event first move is already a live, location-aware answer. Keeping
 * it in one helper means the Suspense fallback and the quiet-day result use the
 * exact same component, rows, weather lean, ranking, and trust language. */
function OpenPlaceLead({
  rows,
  note,
}: {
  rows: DaypartRows;
  note: string | null;
}) {
  return <DaypartNeeds rows={rows} note={note} />;
}

/** Weather-aware ordering is a progressive enhancement. The ordinary local
 * shelf paints immediately while the cached forecast settles; a cold weather
 * provider can never delay Today's document shell or masthead. */
async function WeatherAwareOpenPlaceLead({
  now,
  baseRows,
  forecastPromise,
}: {
  now: Date;
  baseRows: DaypartRows;
  forecastPromise: ReturnType<typeof getNwsForecast>;
}) {
  const forecast = await forecastPromise;
  const lean = leanFromForecast(forecast, now);
  const rows = lean ? buildDaypartRows(now, lean) : baseRows;
  // Say when the rain stops, not just that it is out there. The full hourly
  // forecast is already awaited here for a one-word lean; wetWindowEnd walks
  // the same array to the first hour that is no longer wet. It returns null
  // when the feed's window ends while it is still raining, so an unknown end
  // stays unstated rather than becoming a guess.
  const wetEnd = lean === "wet" ? wetWindowEnd(forecast, now) : null;
  const note =
    lean === "wet"
      ? wetEnd
        ? `${wetEnd.noun} around until ${wetEnd.endsAtLabel}, so indoor picks lead.`
        : "Rain is around for a while, so indoor picks lead."
      : lean === "hot"
        ? "It is a hot one, so cool-down picks lead."
        : null;
  return <OpenPlaceLead rows={rows} note={note} />;
}

/** Upgrade only the food-truck sentence from the cron-built snapshot. The row
 * itself is already present in the Suspense fallback, so this bounded Blob read
 * cannot hold up Today or trigger publisher fetches. */
async function TodayFoodTruckGuideWithSchedule({ now }: { now: Date }) {
  let nextStop: ReturnType<typeof nextPublishedFoodTruckStop> = null;
  try {
    const schedule = await getStoredFoodTruckSchedule(now);
    nextStop = schedule
      ? nextPublishedFoodTruckStop(schedule.stops, now)
      : null;
  } catch {
    // The immediate roster door remains useful if the stored snapshot is unavailable.
  }
  return (
    <TodayFoodTruckGuide
      nextFoodTruckStop={nextStop}
      asOf={now.toISOString()}
    />
  );
}

/** Town label for an event. The City of Frederick reads "Downtown Frederick"
 *  (owner call, 2026-07-21: the dividing line is the city/county boundary, not
 *  the tight historic-core geofence — the East Frederick brewery corridor,
 *  Rockwell and Attaboy's taproom included, is downtown). The municipality slug
 *  already encodes that city-vs-county line, so any Frederick-city event carries
 *  the downtown label; other towns pass through. Null when the town is unknown. */
function eventTown(ev: { municipality_name?: string; municipality?: string }): string | null {
  const t = ev.municipality_name?.trim();
  if (!t) return null;
  if (ev.municipality === "frederick") return "Downtown Frederick";
  return t;
}

/** A walk time is only honest for a venue we KNOW the position of — the loader
 *  stamps "venue_match" / "exact_address" on those (and lists "area"/"unknown"
 *  ones without a distance). Gate the tile's walk figure on that + a valid
 *  in-county coordinate, so we never measure a stroll to a guessed point. */
function hasPreciseGeo(e: { geo_confidence?: string; geom?: { lng: number; lat: number } | null }): boolean {
  return (
    (e.geo_confidence === "venue_match" || e.geo_confidence === "exact_address") &&
    isValidCoord(e.geom ?? null)
  );
}

/** Eastern wall-clock hour (0-23) of an ISO instant — the program's
 *  daypart grouping key. */
function easternStartHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" })
      .format(new Date(iso)),
  );
}

/** The one today-program derivation, read by the What's-on program for both
 *  its feature and remaining rows. Keeping those decisions together means the
 *  selected feature can never be repeated in the timeline below it. */
function deriveTodayProgram(publicEvents: Awaited<EventsPromise>["publicEvents"], now: Date) {
  const todayAll = publicEvents
    .filter((e) => isEventToday(e.starts_at, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  // Time-honesty partition (the 7:55 PM audit render led with six ENDED 2-4 PM
  // library crafts while a live Keys game sat ninth): the rail carries only
  // what's live or still ahead; finished draws demote to a quiet "Earlier
  // today" line list, and finished civic rows drop entirely (a meeting that
  // ended has no evening value). Grouping stays by start-day; the floor is
  // isEventEnded's real end time.
  const ended = todayAll.filter((e) => isEventEnded(e, now));
  const ahead = todayAll.filter((e) => !isEventEnded(e, now));
  // The headline treatment is for DRAWS only. Routine recurring programming
  // (storytime, ESL class, tech help — the standing library calendar) joins
  // civic business in the quiet program rows, ordered by start time, so the
  // hierarchy never flattens.
  const todaysEvents = ahead
    .filter((e) => !isUtilityEvent(e) && !isRoutineProgram(e))
    .sort(compareForLead);
  const alsoToday = ahead.filter((e) => isUtilityEvent(e) || isRoutineProgram(e));
  const earlierToday = ended.filter((e) => !isUtilityEvent(e));
  // The selected lead renders exactly once (as the page headliner). Duplicate
  // feed occurrences are removed from the compact program below instead of
  // removing the lead.
  const { feature, remaining: upcomingRest } = splitTonightFeature(now, todaysEvents);
  return {
    todayAll,
    ahead,
    feature,
    upcomingRest,
    remainingAlsoToday: withoutTodayFeature(feature, alsoToday),
    remainingEarlierToday: withoutTodayFeature(feature, earlierToday),
  };
}

/** One line of the day program: mono time column (the visible sort key),
 *  then title + venue. The editorial tier reads as TYPOGRAPHY — draws get
 *  weight, ink, and their category's color dot; civic/routine rows sit in
 *  the same timeline, smaller and grayer. Live rows swap the clock for a
 *  pulsing "Now". */
function ProgramRow({
  event: e,
  quiet,
  now,
}: {
  event: Awaited<EventsPromise>["publicEvents"][number];
  quiet: boolean;
  now: Date;
}) {
  const live = isEventLiveNow(e, now);
  const time = eventDateBlock(e).time;
  const accent = CATEGORY_BY_SLUG[e.category ?? ""]?.color ?? "#7A7975";
  const town = eventTown(e);
  // "Frederick · Frederick": some feeds stamp the town as the venue name.
  // One mention is information, two is noise.
  const venue = e.venue_name?.trim();
  const where = [venue, town && town.toLowerCase() !== venue?.toLowerCase() ? town : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <Link
        href={`/events/${e.slug}`}
        prefetch={false}
        className="tap-44-y flex items-start gap-3 border-b py-2 pr-0.5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <span
          className="flex w-[58px] shrink-0 items-center gap-1 pt-px font-mono text-[11px] font-semibold tabular-nums leading-snug"
          style={{ color: live ? "var(--app-brand-press)" : "var(--app-ink-3)" }}
        >
          {live && (
            <span aria-hidden className="live-dot h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--app-brand)" }} />
          )}
          {live ? "Now" : time}
        </span>
        {quiet ? (
          <span className="min-w-0 flex-1 truncate text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {e.title}
            {(venue || town) && (
              <span style={{ color: "var(--app-ink-3)" }}> · {venue ?? town}</span>
            )}
          </span>
        ) : (
          <div className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
              {e.title}
            </span>
            {where && (
              <span className="mt-0.5 block truncate text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                {where}
              </span>
            )}
            {/* Real walk minutes from the user's cached fix (LocationPrime
                consent), precisely-located venues only; self-hides. */}
            {hasPreciseGeo(e) && <EventWalkTime dest={e.geom} />}
          </div>
        )}
        {!quiet && (
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
        )}
      </Link>
    </li>
  );
}

/** What's on = every PUBLIC event in the city or county TODAY, soonest first.
 *  Draws (concerts/markets/shows) lead as cards; routine recurring programs
 *  join the same chronological program as quiet rows. */
async function WhatsOn({ eventsPromise, now }: { eventsPromise: EventsPromise; now: Date }) {
  const { publicEvents, sourceHealth } = await eventsPromise;
  // (The overnight "First thing tomorrow" strip that used to live here grew into
  // its own composed TomorrowPreview beat above — top draw + weather look, gated
  // on the same "late" daypart — so the tomorrow answer isn't duplicated.)
  // The headliner itself renders ONCE in TodayDecisionLead; this section
  // carries the rest of the program. Same derivation, same promise.
  const { ahead, feature, upcomingRest, remainingAlsoToday, remainingEarlierToday } =
    deriveTodayProgram(publicEvents, now);
  const featureIsPromoted = feature
    ? shouldPromoteTodayHeadliner(feature, now)
    : false;
  // "N events today" counts only what is still AHEAD (the headliner plus the
  // forward program), never the draws that already wrapped up — those live in
  // the collapsed "Earlier today" list and must not inflate the header count
  // (the 7:55 PM audit: six ended library crafts made the count read "11" over
  // ~3 visible rows). Dedupe the headliner's repeat feed occurrences.
  const featureDuplicateCount = feature
    ? Math.max(0, ahead.filter((event) => isSameTodayListing(event, feature)).length - 1)
    : 0;
  const visibleTodayCount = ahead.length - featureDuplicateCount;

  // The day PROGRAM (replaced the unlabeled sideways rail + separate "Also
  // today" bucket, owner call 2026-07-15: "feels like a list with no
  // understanding of what's in the list"). One chronological spine, grouped
  // by daypart, draws and quiet civic/routine rows interleaved at their real
  // times — the tier survives as typography (weight + ink), not as a second
  // mystery list. A vertical column also shows the whole evening at a
  // glance where the rail hid all but two tiles.
  const program = [
    ...(!featureIsPromoted && feature ? [{ e: feature, quiet: false }] : []),
    ...upcomingRest.map((e) => ({ e, quiet: false })),
    ...remainingAlsoToday.map((e) => ({ e, quiet: true })),
  ].sort((a, b) => Date.parse(a.e.starts_at) - Date.parse(b.e.starts_at));
  // The front page is a briefing, not the calendar. Eight rows show the shape
  // of the day without making every visitor scroll through the full feed; the
  // explicit remainder link preserves complete access.
  const PROGRAM_MAX = 3;
  const shown = program.slice(0, PROGRAM_MAX);
  const programOverflow = program.length - shown.length;
  const partOf = (row: (typeof program)[number]): string => {
    if (row.e.is_all_day) return "All day";
    const h = easternStartHour(row.e.starts_at);
    return h < 12 ? "This morning" : h < 17 ? "This afternoon" : "Tonight";
  };
  const programGroups: { label: string; rows: typeof program }[] = [];
  for (const row of shown) {
    const label = partOf(row);
    const last = programGroups[programGroups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else programGroups.push({ label, rows: [row] });
  }
  const tonightCount = ahead.filter(
    (e) =>
      (!feature || e === feature || !isSameTodayListing(e, feature)) &&
      !e.is_all_day &&
      easternStartHour(e.starts_at) >= 17,
  ).length;

  // A degraded archive with no usable rows is an unknown calendar state, not
  // an empty day. Do not leave a heading with a blank body or claim that
  // nothing is happening; the full Events board remains available in the
  // global navigation while this optional briefing section stays quiet.
  if (!shouldRenderTodayEventSection({
    degraded: sourceHealth.degraded,
    featurePromoted: featureIsPromoted,
    programCount: program.length,
    earlierCount: remainingEarlierToday.length,
  })) {
    return null;
  }

  return (
    <section className="mt-5 space-y-3" aria-label="Events today">
      <DismissibleSection
        id="upcoming"
        title="Events today"
        href="/events"
        cta={visibleTodayCount > 0 || feature ? "See all" : "Full board"}
        flat
        meta={
          visibleTodayCount > 0
            ? `${visibleTodayCount} today${tonightCount > 0 ? ` · ${tonightCount} tonight` : ""} · Countywide${sourceHealth.degraded ? " · Partial coverage" : ""}`
            : sourceHealth.degraded
              ? "Partial calendar coverage"
              : undefined
        }
      >
        {/* Keep degraded-source honesty in the section's own metadata rather
            than repeating the Events page's full warning card. Today stays
            calm and scannable; the board remains the place to retry feeds and
            inspect the complete coverage state. */}
        {/* A real draw can still earn the editorial feature, but it belongs to
            the explicitly countywide event program. It must never displace the
            town-aware place answer above or make the shared town control feel
            inert. The program array below already removes this exact feature. */}
        {featureIsPromoted && feature ? (
          <TonightHeadline event={feature} now={now} embedded />
        ) : null}
        {program.length > 0 || remainingEarlierToday.length > 0 ? (
          <div className="space-y-3">
            {/* ONE-HERO composition, part 2: the quiet-day truth. When no real
                draw earned the page headline, say so plainly instead of
                promoting a routine row into a fake hero; the quiet program
                rows below and the week content further down carry the page.
                Suppressed when sources are degraded — we can't call a day quiet
                when a feed just failed to load. */}
            {!feature && !sourceHealth.degraded && (
              <p className="px-0.5 pt-1 text-[13.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                It is a quiet {easternStartHour(now.toISOString()) >= 17 ? "night" : "day"} around here. The
                week ahead is on the{" "}
                <Link href="/events" className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
                  events page
                </Link>
                .
              </p>
            )}
            {programGroups.length > 0 && (
              <div className="reveal-up">
                {programGroups.map((group) => (
                  <div key={group.label}>
                    <p className="px-0.5 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                      {group.label}
                    </p>
                    <ul>
                      {group.rows.map(({ e, quiet }) => (
                        <ProgramRow key={`${e.slug}-${e.starts_at}`} event={e} quiet={quiet} now={now} />
                      ))}
                    </ul>
                  </div>
                ))}
                {programOverflow > 0 && (
                  <Link
                    href="/events"
                    className="tap-44-y flex items-center justify-between px-0.5 py-2.5 text-[13px] font-semibold"
                    style={{ color: "var(--app-brand-press)" }}
                  >
                    +{programOverflow} more today
                    <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                  </Link>
                )}
              </div>
            )}
            {/* Finished draws collapse to one honest line — the record of the
                day is a tap away, but done things don't spend screen. Native
                <details>: no client JS. */}
            {remainingEarlierToday.length > 0 && (
              <details className="group">
                <summary className="tap-44-y flex cursor-pointer list-none items-center gap-1.5 px-0.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-ink-3)" }}>
                  <ChevronRight aria-hidden className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" strokeWidth={2.5} />
                  Earlier today · {remainingEarlierToday.length} wrapped up
                </summary>
                <ul className="mt-1">
                  {remainingEarlierToday.map((e) => (
                    <li key={`${e.slug}-${e.starts_at}`}>
                      <EventCard event={e} variant="utility" hideDate />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : featureIsPromoted ? (
          /* The headliner above is the whole calendar — an honest one-liner,
             not an "empty" claim the hero itself contradicts. */
          <p className="text-body py-4" style={{ color: "var(--app-ink-3)" }}>
            Nothing else is on the calendar today.
          </p>
        ) : sourceHealth.degraded ? null : (
          <p
            className="text-body py-4"
            style={{ color: "var(--app-ink-3)" }}
          >
            {/* Only an empty set we TRUST is stated as "no events." The
                heading already carries the one route to the complete board,
                so this stays an answer instead of repeating the same link. */}
            No events are on the calendar today.
          </p>
        )}
      </DismissibleSection>
    </section>
  );
}
