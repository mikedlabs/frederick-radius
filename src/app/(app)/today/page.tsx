import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import TodayCard from "@/components/today/TodayCard";
import TodayPlanTonightLink from "@/components/today/TodayPlanTonightLink";
import { ChevronRight } from "lucide-react";
import { easternDayKey } from "@/lib/tz";
import OnNowBand from "@/components/today/OnNowBand";
import KeysScore from "@/components/today/KeysScore";
import LocalSportsScoreboard from "@/components/today/LocalSportsScoreboard";
import CivicAlerts from "@/components/today/CivicAlerts";
import MomentSpotlight from "@/components/today/MomentSpotlight";
import TodayFairFeature from "@/components/today/TodayFairFeature";
import Image from "next/image";
import { activeMoment } from "@/data/civic-moments";
import MastheadNotes from "@/components/today/MastheadNotes";
import EventCard from "@/components/event/EventCard";
import {
  eventCardVisual,
  eventVisualTreatment,
} from "@/components/event/eventVisuals";
import RadiusPhoto, {
  RadiusPhotoScope,
  RadiusPhotoWhen,
} from "@/components/ui/RadiusPhoto";
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
import { keepDegradedEventRenderShort } from "@/lib/loaders/unifiedEvents";
import { isUtilityEvent } from "@/lib/event-kind";
import { compareForLead, isRoutineProgram } from "@/lib/events/lead-rank";
import { isEventToday, isEventEnded, isEventLiveNow } from "@/lib/eventWhenLabel";
import { splitTonightFeature, withoutTodayFeature } from "@/lib/today/tonight";
import PoolsToday from "@/components/today/PoolsToday";
import TodayLocalGuides, { TodayFoodTruckGuide } from "@/components/today/TodayLocalGuides";
import FreshnessGuard from "@/components/today/FreshnessGuard";
import TomorrowPreview, { dayProgramLabel } from "@/components/today/TomorrowPreview";
import TonightMap, {
  tonightMapPlan,
  type TonightMapPlan,
} from "@/components/today/TonightMap";
import WeatherSafeGoldenHour from "@/components/today/WeatherSafeGoldenHour";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { leanFromForecast, wetWindowEnd } from "@/lib/today/weatherLean";
import EventWalkTime from "@/components/today/EventWalkTime";
import EventSheetBoundary from "@/components/event/EventSheetBoundary";
import PlaceSheetBoundary from "@/components/place/PlaceSheetBoundary";
import TodayAsk from "@/components/today/TodayAsk";
import BrowsePlacesDisclosure from "@/components/today/BrowsePlacesDisclosure";
import {
  mastheadWeatherPhrase,
  todayFrame,
  todayMastheadPhoto,
} from "@/lib/today/masthead";
import {
  comingDay,
  comingDayWeatherSentence,
  isStillOnTonight,
  isTomorrowPreviewTime,
  selectComingDayEvents,
} from "@/lib/today/tomorrow";
import {
  daypart,
  easternHour,
  isTonightDaypart,
  programDaypartLabel,
} from "@/lib/daypart";
import { formatEasternDateline } from "@/lib/format/easternClock";
import DaypartNeeds from "@/components/today/DaypartNeeds";
import CravingStrip from "@/components/now/CravingStrip";
import { buildDaypartRows } from "@/lib/loaders/daypartPicks";
import { getStoredFoodTruckSchedule } from "@/lib/food-trucks/schedule-loader";
import { nextPublishedFoodTruckStop } from "@/lib/food-trucks/today-summary";
import { shouldPromoteTodayHeadliner } from "@/components/today/headlinerTiming";
import TodayScopeStatus from "@/components/today/TodayScopeStatus";
import TodayEventsRecovery from "@/components/today/TodayEventsRecovery";
import { shouldRenderTodayEventSection } from "@/lib/today-events";
import { eventTown } from "@/lib/events/eventTown";
import { eventHasPreciseDisplayLocation } from "@/lib/events/geo-confidence";
import { eventDecisionVerification } from "@/lib/events/decision-verification";
import AppTransitionLink from "@/components/nav/AppTransitionLink";
import PageChapter from "@/components/ui/PageChapter";
import SectionHeading from "@/components/ui/SectionHeading";
import styles from "@/components/today/TodayLayout.module.css";
import {
  TODAY_FAIR_PROMOTION_SLUG,
  todayFairPromotionPhase,
} from "@/lib/today/fair-promotion";

/**
 * Now — the daily briefing.
 *
 * Spine (top to bottom — matches the render below):
 *
 *   1. Identity       → active alerts and the time-aware masthead
 *   2. Decide now     → one Find doorway before campaigns and weather
 *                       + a location-aware place answer
 *   3. The day's events → a numbered pin map of the precisely located
 *                       venues over a short chronological program, in a
 *                       chapter named by the daypart ("Today's events",
 *                       "Tonight"); weather follows as one link row
 *   4. Plan the rest  → scheduled utilities, sports, light, and tomorrow
 *   5. Keep exploring → local guides and saved places, collapsed
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
  const fairPromotionPhase = todayFairPromotionPhase(now);
  const civicMoment = activeMoment(now);
  const civicMomentLeadsToday =
    civicMoment?.slug === "in-the-street-2026" &&
    civicMoment.ends === easternDayKey(now);

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
      <div id="on-now" style={{ scrollMarginTop: "calc(var(--app-topbar-h, 56px) + 12px)" }}>
        <Suspense fallback={null}>
          <OnNowBand now={now} eventsPromise={eventsPromise} />
        </Suspense>
      </div>
      <div className="today-sports-stack">
        <h2 className="today-sports-stack__heading">Local sports</h2>
        <KeysScore />
        <LocalSportsScoreboard />
      </div>
    </>
  );

  // The event program streams inside its own Suspense boundary. After 9 PM it
  // also carries the coming day's rows and their NWS sentence, read from the
  // same bounded forecast race the place shelf already started.
  const whatsOn = (
    <div id="whats-on" style={{ scrollMarginTop: "calc(var(--app-topbar-h, 56px) + 12px)" }}>
      <Suspense fallback={null}>
        <WhatsOn
          eventsPromise={eventsPromise}
          forecastPromise={forecastForLean}
          now={now}
        />
      </Suspense>
    </div>
  );

  return (
    // Sheet boundary in lean-surface mode: today's rails deliberately keep
    // the event corpus out of the client payload, so a tap on any event
    // link opens the sheet on a skeleton and fetches just that event.
    // Real anchors, SEO, and modified clicks all pass through untouched.
    <EventSheetBoundary fetchMissing className="relative">
      <PlaceSheetBoundary fetchMissing>
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
          <CivicAlerts compact />
        </div>
      </Suspense>

      {/* In The Streets is the county's shared plan today, so it takes the
          lead over the normal daily briefing and the upcoming Fair campaign.
          Active alerts remain above it because they can change the plan. */}
      {civicMoment && civicMomentLeadsToday && (
        <div className="mb-5">
          <MomentSpotlight moment={civicMoment} isDayOf />
        </div>
      )}

      {/* ── TITLE — a TIME-AWARE masthead (owner call, 2026-07-20: make /today
          "time-aware"). The h1 changes with the Eastern daypart from the one
          daypart clock (src/lib/daypart.ts), the same clock the place shelf
          and the event program read, so the page NAMES the moment it is
          leading with. The 160px photo band (owner, PR #1734) shows an owner
          archive frame chosen by Eastern season and daypart, credited from
          its own geotag and capture month, and carries the dateline and the
          current weather phrase so the facts sit on the picture instead of in
          another row below it. Server-computed on the Eastern clock; the page
          ISRs every 300s so a boundary rolls within minutes. This is the real
          document h1. Sits below an active civic alert (alerts still lead). */}
      {(() => {
        const frame = todayFrame(daypart(now));
        const photo = todayMastheadPhoto(now);
        return (
          <header className={`scroll-masthead ${styles.masthead}`}>
            <div
              className={styles.mastheadLead}
              data-today-photo-lead
              data-today-photo-season={photo.season}
              data-today-photo-daypart={photo.daypart}
            >
              <h1 className={styles.title}>
                {frame.title}
              </h1>
              <p className={styles.dateline} data-today-dateline>
                <span>{formatEasternDateline(now)}</span>
                <Suspense fallback={null}>
                  <MastheadWeather forecastPromise={forecastForLean} />
                </Suspense>
              </p>
              <figure className={styles.portrait}>
                <Image src={photo.src} priority fill sizes="(min-width: 1024px) 960px, (min-width: 768px) 720px, calc(100vw - 32px)" alt={photo.alt} />
                <figcaption className={styles.photoCredit}>{photo.credit}</figcaption>
              </figure>
            </div>
            <div className={styles.scope}>
              <Suspense fallback={null}><TodayScopeStatus /></Suspense>
            </div>
          </header>
        );
      })()}

      <div data-today-briefing className={styles.briefing}>
        {/* The universal request doorway is Today's primary action. Keep it
            immediately after the scope control: a seasonal campaign must not
            push it more than a screen down on a phone. Active alerts still
            lead the document because they can change a visitor's plans. */}
        <div className="today-arrival today-arrival--find">
          <TodayAsk embedded />
        </div>

      <div data-today-current-content className={styles.currentContent}>
        {/* Two picture answers sit above the phone's bottom nav, so the full
            category index follows them instead of sitting between Find and
            the places. /today?want=... still opens it on arrival. */}
        <div aria-label="Places for your area" className={styles.places}>
          {decisionLead}
          <BrowsePlacesDisclosure>
            <CravingStrip />
          </BrowsePlacesDisclosure>
        </div>

      {/* The chapter is named by the one daypart clock: "Today's events",
          then "Tonight" from the evening daypart, when the masthead says
          Tonight too. After 9 PM it covers what is still on and the coming
          day, which leads on its own once tonight is done. The name is a real
          h2 in the same register as the place heading beside it, so the
          column reads by type and heading navigation reaches it; the
          chapter's small register would only repeat it, so the layout hides
          it here. The program adds no h2 of its own, and the coming day sits
          under this one as an h3. */}
      <PageChapter
        label={dayProgramLabel(now)}
        variant="plain"
        className={styles.events}
      >
        <div className="mb-3">
          <SectionHeading title={dayProgramLabel(now)} />
        </div>
        {/* A second civic moment still matters during the Fair campaign. Keep
            it with the day's program so it survives without competing with
            the place choices above. */}
        {fairPromotionPhase &&
        civicMoment &&
        civicMoment.slug !== TODAY_FAIR_PROMOTION_SLUG &&
        !civicMomentLeadsToday ? (
          <div className="mb-4">
            <MomentSpotlight moment={civicMoment} />
          </div>
        ) : null}
        {whatsOn}
        {/* Planning the evening belongs with the evening's events. It used
            to share the weather card's heading; weather is one link row now,
            and a second link cannot sit inside it. Retires itself from 9 PM
            on the visitor's clock. */}
        <Suspense fallback={null}><TodayPlanTonightLink renderedAt={now.toISOString()} /></Suspense>
      </PageChapter>
      </div>

      {/* Secondary context follows the useful place and event answers.
          Find and nearby choices remain ahead of the seasonal campaign.
          Fair Day owns this doorway
          from Sep 2–26, then retires itself on Sep 27. When another civic
          moment overlaps the Fair campaign, it appears in the day's events
          chapter above instead of disappearing. */}
      <div className={styles.context}>
      {fairPromotionPhase ? (
        <TodayFairFeature phase={fairPromotionPhase} briefing />
      ) : civicMoment ? (
        <div>
          <MomentSpotlight moment={civicMoment} />
        </div>
      ) : null}

      {/* Weather is one link row to the full forecast: the sky glyph, the
          temperature now, then the condition with today's high and tonight's
          low, all from the NWS and each left out when the feed lacks it. A
          1px rule above it replaces the old sunken card. */}
      <section data-today-weather className={styles.weather}>
        <AppTransitionLink
          href="/pulse?open=weather"
          prefetch={false}
          className={`group ${styles.weatherRow}`}
        >
          <Suspense fallback={<Skeleton.Block height={32} width="60%" round="var(--app-radius-sm)" />}>
            <TodayCard />
          </Suspense>
          <span className="sr-only">Open the full forecast.</span>
          <ChevronRight
            aria-hidden
            className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            style={{ color: "var(--app-ink-3)" }}
          />
        </AppTransitionLink>
      </section>
      </div>

      </div>

      <CollapsibleSection
        title="Plan the rest"
        storageKey="fr.today.plan-rest"
        defaultOpen={false}
        headingLevel={2}
        className="today-plan-rest today-disclosure mt-8 border-t pt-2 [&>h2>button]:min-h-11"
      >
        <div role="group" aria-label="Useful today">
          {availableToday}

          {/* Tonight's light is a scheduled fact like the rest of this chapter.
              It self-hides outside its evening window and in bad weather. */}
          <Suspense fallback={null}>
            <WeatherSafeGoldenHour now={now} />
          </Suspense>
          {/* The night owl's tomorrow answer moved out of this disclosure and
              into the day program (WhatsOn), where it leads after 9 PM. */}
        </div>
      </CollapsibleSection>

      {/* Secondary doors share one deliberate reveal. The old lower page also
          repeated generated collections, a rotating place list, and a taste
          nudge; those made the briefing feel endless without improving the
          immediate decision. Their dedicated routes remain available. */}
      <CollapsibleSection
        title="Local guides and saved places"
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
      </PlaceSheetBoundary>
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
  return <DaypartNeeds rows={rows} note={note} variant="brief" />;
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
  // "Indoor picks lead" is a claim about the shelf, so only say it when the
  // shelf agrees. DaypartNeeds opens on the first row that HAS picks; on a wet
  // morning before the museums unlock, coffee leads and the ordering half of
  // the sentence would be false. The weather fact itself is always true and
  // always worth a line.
  const leadCategory = rows.find((row) => row.picks.length > 0)?.category ?? null;
  const leanLeads =
    lean != null &&
    leadCategory != null &&
    !baseRows.some((row) => row.category === leadCategory);
  const note =
    lean === "wet"
      ? wetEnd
        ? `${wetEnd.noun} around until ${wetEnd.endsAtLabel}${leanLeads ? ", so indoor picks lead." : "."}`
        : leanLeads
          ? "Rain is around for a while, so indoor picks lead."
          : "Rain is around for a while."
      : lean === "hot"
        ? leanLeads
          ? "It is a hot one, so cool-down picks lead."
          : "It is a hot one out there."
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
    if (
      nextStop &&
      easternDayKey(new Date(nextStop.startsAt)) !== easternDayKey(now)
    ) {
      nextStop = null;
    }
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

/** Eastern wall-clock hour (0-23) of an ISO instant — the program's
 *  daypart grouping key, read through the one daypart clock. */
function easternStartHour(iso: string): number {
  return easternHour(new Date(iso));
}

/** The async masthead tail: " · 48° and clear" after the dateline, from the
 *  bounded forecast race the page already started. A slow or missing reading
 *  leaves the dateline alone rather than guess. */
async function MastheadWeather({
  forecastPromise,
}: {
  forecastPromise: ReturnType<typeof getNwsForecast>;
}) {
  const forecast = await forecastPromise;
  const current = forecast?.hourly?.[0] ?? null;
  const phrase = mastheadWeatherPhrase(current?.temperature, current?.shortForecast);
  if (!phrase) return null;
  return (
    <>
      <span aria-hidden> · </span>
      <span>{phrase}</span>
    </>
  );
}

/** The one today-program derivation, read by the What's-on program for both
 *  its feature and remaining rows. Keeping those decisions together means the
 *  selected feature can never be repeated in the timeline below it.
 *
 *  `late` is the 9 PM to 5 AM daypart. Then the program is what is still on
 *  tonight (isStillOnTonight), wrapped-up rows are dropped rather than listed
 *  under "Earlier today", and the coming day is answered separately. */
function deriveTodayProgram(
  publicEvents: Awaited<EventsPromise>["publicEvents"],
  now: Date,
  late: boolean,
) {
  const tonightEnds = late ? comingDay(now) : null;
  const todayAll = publicEvents
    .filter((e) =>
      tonightEnds
        ? isStillOnTonight(e, now, tonightEnds)
        : isEventToday(e.starts_at, now),
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  // Time-honesty partition (the 7:55 PM audit render led with six ENDED 2-4 PM
  // library crafts while a live Keys game sat ninth): the rail carries only
  // what's live or still ahead; finished draws demote to a quiet "Earlier
  // today" line list, and finished civic rows drop entirely (a meeting that
  // ended has no evening value). Grouping stays by start-day; the floor is
  // isEventEnded's real end time. After 9 PM the earlier list is dropped.
  const ended = late ? [] : todayAll.filter((e) => isEventEnded(e, now));
  const ahead = late ? todayAll : todayAll.filter((e) => !isEventEnded(e, now));
  // The headline treatment is for DRAWS only. Routine recurring programming
  // (storytime, ESL class, tech help — the standing library calendar) joins
  // civic business in the quiet program rows, ordered by start time, so the
  // hierarchy never flattens.
  const todaysEvents = ahead
    .filter(
      (e) =>
        !isUtilityEvent(e) &&
        !isRoutineProgram(e) &&
        eventDecisionVerification(e, now).sourceVerified,
    )
    .sort(compareForLead);
  const strongEventKeys = new Set(
    todaysEvents.map((event) => `${event.slug}|${event.starts_at}`),
  );
  // A public but not freshly source-verified draw can stay in the compact
  // chronological program. It cannot receive Today's editorial headline.
  const alsoToday = ahead.filter(
    (event) => !strongEventKeys.has(`${event.slug}|${event.starts_at}`),
  );
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

type ProgramEvent = Awaited<EventsPromise>["publicEvents"][number];

/** Rows shown below 1024px, and in the wider two-column briefing. */
const PROGRAM_COMPACT_MAX = 3;
const PROGRAM_WIDE_MAX = 5;

/** Painted size of a row's flyer frame. */
const PROGRAM_FLYER_PX = 56;

const programRowKey = (e: ProgramEvent) => `${e.slug}-${e.starts_at}`;

/** Where a list's pin map is drawn, and so where its rows show the disc
 *  column: at every width, only from 1024px (the phone's rows held fewer than
 *  two pins), or nowhere. */
type ProgramMapScope = "all" | "wide" | null;

function programMapScope(plan: TonightMapPlan): ProgramMapScope {
  return plan.compact ? "all" : plan.wide ? "wide" : null;
}

/** The map rows for a list, in display order. */
function programMapRows(events: readonly ProgramEvent[]) {
  return events.map((e) => ({
    key: programRowKey(e),
    name: e.title,
    geom: e.geom,
    geo_confidence: e.geo_confidence,
  }));
}

/** One line of the day program: the pin number that matches the map above
 *  it, the time (the visible sort key), then title and "Venue · town". The
 *  editorial tier reads as type: draws get the title size in Ink, civic and
 *  routine rows sit in the same timeline in body size and Ink 2. A live row
 *  swaps its clock for "Now" with the Amber live dot. A publisher flyer, when
 *  the event has one, sits whole in a small paper frame on the right with
 *  nothing drawn over it, and disappears if it fails to load. */
function ProgramRow({
  event: e,
  quiet,
  now,
  pin = null,
  mapScope = null,
  wideOnly = false,
}: {
  event: ProgramEvent;
  quiet: boolean;
  now: Date;
  /** This row's number on the map above, when it has a pin. */
  pin?: string | null;
  /** Where the list's map is drawn; the disc column follows it. */
  mapScope?: ProgramMapScope;
  /** Shown only in the wider layout (rows past the phone's three). */
  wideOnly?: boolean;
}) {
  const live = isEventLiveNow(e, now);
  const time = eventDateBlock(e).time;
  const town = eventTown(e);
  // "Frederick · Frederick": some feeds stamp the town as the venue name.
  // One mention is information, two is noise.
  const venue = e.venue_name?.trim();
  const where = [venue, town && town.toLowerCase() !== venue?.toLowerCase() ? town : null]
    .filter(Boolean)
    .join(" · ");
  const visual = eventCardVisual(e);
  const flyer = visual && eventVisualTreatment(visual) === "flyer" ? visual : null;
  return (
    <li className={wideOnly ? "hidden lg:block" : undefined}>
      <Link
        href={`/events/${e.slug}`}
        prefetch={false}
        data-today-program-row
        data-today-pin={pin ?? undefined}
        className={`tap-44-y flex items-start gap-2.5 border-b pr-0.5 ${styles.eventRow}`}
        style={{ borderColor: "var(--app-border)" }}
      >
        {mapScope ? (
          // The disc column exists wherever the map is drawn, so pinned and
          // unpinned rows keep one time column. Only a pinned row fills it.
          <span
            aria-hidden
            data-today-pin-disc={pin ? "" : undefined}
            className={`${mapScope === "wide" ? "hidden lg:flex" : "flex"} text-caption mt-px h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full font-bold tabular-nums`}
            style={pin ? { background: "var(--app-brand)", color: "var(--app-bg)" } : undefined}
          >
            {pin}
          </span>
        ) : null}
        <span
          className="text-meta-lg flex w-[60px] shrink-0 items-center gap-1.5 font-semibold tabular-nums"
          style={{ color: live ? "var(--app-ink)" : quiet ? "var(--app-ink-3)" : "var(--app-ink-2)" }}
        >
          {live && (
            <span aria-hidden className="live-dot h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--app-amber)" }} />
          )}
          {live ? "Now" : time}
        </span>
        <div className="min-w-0 flex-1">
          <span
            className={`${quiet ? "text-body" : "text-title-sm"} line-clamp-2`}
            style={{ color: quiet ? "var(--app-ink-2)" : "var(--app-ink)" }}
          >
            {e.title}
          </span>
          {where && (
            <span className="text-meta-lg mt-0.5 block truncate" style={{ color: "var(--app-ink-3)" }}>
              {where}
            </span>
          )}
          {/* Real walk minutes from the user's cached fix (LocationPrime
              consent), precisely-located venues only; self-hides. */}
          {eventHasPreciseDisplayLocation(e) && <EventWalkTime dest={e.geom} />}
        </div>
        {flyer ? (
          <RadiusPhotoScope src={flyer.src} size={PROGRAM_FLYER_PX}>
            <RadiusPhotoWhen is="visible">
              <RadiusPhoto
                size={PROGRAM_FLYER_PX}
                fit="contain"
                alt=""
                loading="lazy"
                className="rounded-[var(--app-radius-sm)]"
              />
            </RadiusPhotoWhen>
          </RadiusPhotoScope>
        ) : null}
      </Link>
    </li>
  );
}

/** What's on = every PUBLIC event in the city or county TODAY, soonest first.
 *  Draws (concerts/markets/shows) lead as cards; routine recurring programs
 *  join the same chronological program as quiet rows. */
async function WhatsOn({
  eventsPromise,
  forecastPromise,
  now,
}: {
  eventsPromise: EventsPromise;
  forecastPromise: ReturnType<typeof getNwsForecast>;
  now: Date;
}) {
  const { publicEvents, sourceHealth } = await eventsPromise;
  // Today reads the same archive as /events, so a degraded read (every
  // build, or a runtime timeout) must not stay cached as this page for the
  // full five minutes either.
  await keepDegradedEventRenderShort(sourceHealth);
  // From 9 PM to 5 AM Today answers by the clock: what is still on tonight
  // leads, then the coming day ("Tomorrow, Thursday", or "Later today,
  // Wednesday" after midnight) with up to three program rows and its NWS
  // sentence. Those rows used to sit inside the collapsed "Plan the rest",
  // so at 10:53 PM tomorrow's listings were a tap behind a closed heading.
  const late = isTomorrowPreviewTime(now);
  const { feature, upcomingRest, remainingAlsoToday, remainingEarlierToday } =
    deriveTodayProgram(publicEvents, now, late);
  const coming = late ? comingDay(now) : null;
  const comingRows = late ? selectComingDayEvents(publicEvents, now) : [];
  const comingWeather = late
    ? comingDayWeatherSentence(await forecastPromise, now)
    : null;
  const comingHasContent = comingRows.length > 0 || comingWeather != null;
  // The coming day carries the pin map only when it leads the chapter
  // (nothing is still on tonight). When tonight's rows lead, they own the map
  // and the numbers, so the coming day's rows stay unnumbered below them.
  const comingDayAnswerWith = (leads: boolean) => {
    if (!coming) return null;
    const plan = leads
      ? tonightMapPlan(programMapRows(comingRows))
      : null;
    const scope = plan ? programMapScope(plan) : null;
    return (
      <TomorrowPreview
        day={coming}
        weatherSentence={comingWeather}
        rowCount={comingRows.length}
        map={
          scope ? (
            <TonightMap
              rows={programMapRows(comingRows)}
              name={coming.laterToday ? "later today's events" : "tomorrow's events"}
            />
          ) : null
        }
      >
        {comingRows.map((e) => (
          <ProgramRow
            key={programRowKey(e)}
            event={e}
            quiet={isRoutineProgram(e)}
            now={now}
            pin={plan?.numbers.get(programRowKey(e)) ?? null}
            mapScope={scope}
          />
        ))}
      </TomorrowPreview>
    );
  };
  const comingDayAnswer = comingDayAnswerWith(false);
  const featureIsPromoted = feature
    ? shouldPromoteTodayHeadliner(feature, now)
    : false;
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
  // The front page is a briefing, not the calendar. Three rows show the shape
  // of the day on a phone without making every visitor scroll through the
  // full feed; the wider two-column briefing has room for five. The link
  // under the rows preserves complete access.
  const shown = program.slice(0, PROGRAM_WIDE_MAX);
  // Show before tell: a numbered pin map of the precisely located rows leads
  // the list, and each pinned row carries the same number. Area-level venues
  // stay listed without a pin, and fewer than two pins draws no map at all.
  const programRows = shown.map(({ e }) => e);
  const mapPlan = tonightMapPlan(programMapRows(programRows), PROGRAM_COMPACT_MAX);
  const mapScope = programMapScope(mapPlan);
  const chapterLabel = dayProgramLabel(now);
  const tonight = isTonightDaypart(daypart(now));
  // Group headings come from the same daypart clock as the masthead and the
  // place shelf, so a 4 PM row is "Tonight" exactly when the title is.
  const partOf = (row: (typeof program)[number]): string => {
    if (row.e.is_all_day) return "All day";
    return programDaypartLabel(easternStartHour(row.e.starts_at));
  };
  const programGroups: {
    label: string;
    rows: Array<(typeof program)[number] & { index: number }>;
  }[] = [];
  shown.forEach((row, index) => {
    const label = partOf(row);
    const last = programGroups[programGroups.length - 1];
    if (last && last.label === label) last.rows.push({ ...row, index });
    else programGroups.push({ label, rows: [{ ...row, index }] });
  });
  // Late at night with nothing still on, tonight has no answer to give: the
  // coming day leads the chapter, with the pin map over its own rows.
  if (late && !featureIsPromoted && program.length === 0 && comingHasContent) {
    return <div className="mt-1">{comingDayAnswerWith(true)}</div>;
  }
  // A degraded archive with no usable rows is an unknown calendar state, not
  // an empty day. Do not leave a heading with a blank body or claim that
  // nothing is happening; the full Events board remains available in the
  // global navigation while this optional briefing section stays quiet.
  // The recovery renders under the events chapter's h2, which already names
  // the daypart, so it adds no heading of its own (headed={false}).
  if (!shouldRenderTodayEventSection({
    degraded: sourceHealth.degraded,
    featurePromoted: featureIsPromoted,
    programCount: program.length,
    earlierCount: remainingEarlierToday.length,
  })) {
    return (
      <>
        <TodayEventsRecovery headed={false} />
        {comingDayAnswer}
      </>
    );
  }

  return (
    <>
    {/* The chapter's heading names this section, so it carries none of its
        own. The link under the rows is the one route to the full board. */}
    <div data-today-program className="space-y-3">
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
                rows below carry the page. Suppressed when sources are
                degraded, because a day cannot be called quiet when a feed
                just failed to load. */}
            {!feature && !sourceHealth.degraded && (
              <p className="text-meta-lg px-0.5" style={{ color: "var(--app-ink-2)" }}>
                It is a quiet {tonight ? "night" : "day"} around here.
              </p>
            )}
            {mapScope ? (
              <TonightMap
                rows={programMapRows(programRows)}
                compactCount={PROGRAM_COMPACT_MAX}
                name={tonight ? "tonight's events" : "today's events"}
              />
            ) : null}
            {programGroups.length > 0 && (
              <div className="reveal-up">
                {programGroups.map((group) => {
                  const wideOnly = group.rows[0].index >= PROGRAM_COMPACT_MAX;
                  return (
                    <div
                      key={`${group.label}-${group.rows[0].index}`}
                      className={wideOnly ? "hidden lg:block" : undefined}
                    >
                      {/* A group named like the chapter ("Tonight" under
                          "Tonight") would only repeat it. */}
                      {group.label !== chapterLabel ? (
                        <p className="text-meta-lg px-0.5 pb-0.5 pt-2 font-semibold" style={{ color: "var(--app-ink-2)" }}>
                          {group.label}
                        </p>
                      ) : null}
                      <ul>
                        {group.rows.map(({ e, quiet, index }) => (
                          <ProgramRow
                            key={programRowKey(e)}
                            event={e}
                            quiet={quiet}
                            now={now}
                            pin={mapPlan.numbers.get(programRowKey(e)) ?? null}
                            mapScope={mapScope}
                            wideOnly={index >= PROGRAM_COMPACT_MAX}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Finished draws collapse to one honest line — the record of the
                day is a tap away, but done things don't spend screen. Native
                <details>: no client JS. */}
            {remainingEarlierToday.length > 0 && (
              <details className="group">
                <summary className="text-meta-lg tap-44-y flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-0.5 font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-ink-3)" }}>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
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
            {late
              ? "Nothing else is listed for tonight."
              : "Nothing else is on the calendar today."}
          </p>
        ) : sourceHealth.degraded ? null : (
          <p
            className="text-body py-4"
            style={{ color: "var(--app-ink-3)" }}
          >
            {/* Only an empty set we TRUST is stated as "no events." The link
                below carries the one route to the complete board, so this
                stays an answer instead of repeating it. */}
            {late
              ? "Nothing more is listed for tonight."
              : "No events are on the calendar today."}
          </p>
        )}
        {/* Degraded-source honesty stays one sentence here rather than the
            Events page's full warning card. It never says the day is empty;
            the board remains the place to retry feeds and inspect coverage. */}
        {sourceHealth.degraded ? (
          <p data-today-program-partial className="text-meta-lg px-0.5" style={{ color: "var(--app-ink-3)" }}>
            Some calendars did not load, so this list may be missing events.
          </p>
        ) : null}
        <Link
          href="/events"
          prefetch={false}
          data-today-program-all
          className="text-body tap-44-y inline-flex min-h-11 items-center gap-1.5 px-0.5 font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          {tonight ? "All of tonight's events" : "All of today's events"}
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
        </Link>
    </div>
    {comingDayAnswer}
    </>
  );
}
