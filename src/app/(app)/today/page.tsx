import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import TodayCard from "@/components/today/TodayCard";
import { ArrowRight, ChevronRight } from "lucide-react";
import { easternDayKey } from "@/lib/tz";
import OnNowBand from "@/components/today/OnNowBand";
import KeysScore from "@/components/today/KeysScore";
import SkyHero, { currentSkyPalette } from "@/components/today/SkyHero";
// AdaptiveGreeting (serif headline like "Sun for now") was removed
// from the SkyHero pre-launch. The temporal anchor (weekday + a live
// clock) now lives in TodayCard inside the SkyHero — without a second
// editorial verdict on top of
// the WeatherHero's own conditions line. AdaptiveGreeting still
// lives at src/components/today/AdaptiveGreeting.tsx if we want to
// surface it elsewhere later.
import CivicAlerts from "@/components/today/CivicAlerts";
import MomentSpotlight from "@/components/today/MomentSpotlight";
import { activeMoment } from "@/data/civic-moments";
import MastheadNotes from "@/components/today/MastheadNotes";
import DismissibleSection from "@/components/today/DismissibleSection";
import EventCard from "@/components/event/EventCard";
import TonightHeadline from "@/components/today/TonightHeadline";
import PageBloom from "@/components/ui/PageBloom";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import SectionHeading from "@/components/ui/SectionHeading";
import Skeleton from "@/components/ui/Skeleton";
import HourlyForecast from "@/components/today/HourlyForecast";
import HourlyDisclosure from "@/components/today/HourlyDisclosure";
import HourlySummary from "@/components/today/HourlySummary";
import WeeklyForecast from "@/components/today/WeeklyForecast";
import WeeklyCard from "@/components/today/WeeklyCard";
import WeeklySummary from "@/components/today/WeeklySummary";
import VisitorStayPrompt from "@/components/today/VisitorStayPrompt";
import EmergencyPrompt from "@/components/today/EmergencyPrompt";
import WorthALook from "@/components/today/WorthALook";
import WeekendPreview from "@/components/today/WeekendPreview";
import FromYourSaved from "@/components/today/FromYourSaved";
import TasteNudge from "@/components/today/TasteNudge";
import CuratedPicks from "@/components/today/CuratedPicks";
import PartnerAppsRow from "@/components/today/PartnerAppsRow";
// CreekHairline removed in the pleasant-layout pass — it was a
// decorative divider between weather/discovery and action; the
// reorder makes the divider unnecessary.

import { eventDateBlock } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isUtilityEvent } from "@/lib/event-kind";
import { compareForLead, isRoutineProgram } from "@/lib/events/lead-rank";
import { isValidCoord, type LngLat } from "@/lib/geo";
import { isDowntownFrederick } from "@/lib/geo/downtown";
import { isEventToday, isEventEnded, isEventLiveNow } from "@/lib/eventWhenLabel";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { isSameTodayListing, splitTonightFeature, withoutTodayFeature } from "@/lib/today/tonight";
import PoolsToday from "@/components/today/PoolsToday";
import FoodTruckToday from "@/components/today/FoodTruckToday";
import FreshnessGuard from "@/components/today/FreshnessGuard";
import TomorrowPreview from "@/components/today/TomorrowPreview";
import GoldenHourCard from "@/components/today/GoldenHourCard";
import EventWalkTime from "@/components/today/EventWalkTime";
import EventSheetBoundary from "@/components/event/EventSheetBoundary";
import TodayAsk from "@/components/today/TodayAsk";
import { todayFrame } from "@/lib/today/masthead";
import { formatEasternDateline } from "@/lib/format/easternClock";
import DaypartNeeds from "@/components/today/DaypartNeeds";
import CravingStrip from "@/components/now/CravingStrip";
import BrowsePlacesDisclosure from "@/components/today/BrowsePlacesDisclosure";
import ToolboxTeaser from "@/components/nav/ToolboxTeaser";
import { buildDaypartRows } from "@/lib/loaders/daypartPicks";

/**
 * Now — the daily briefing.
 *
 * Spine (one-hero pass, top to bottom — matches the render below; the
 * evening gear reorders 2-4, see the EVENING GEAR note in HomePage):
 *
 *   1. SkyHero        → time-of-day sky + date, clock, and weather
 *   2. OnNowBand      → current utility followed by clearly timed later items
 *   3. Headliner      → THE headline of the page when a real draw is on
 *                       (TonightHeadline); nothing renders on a quiet day
 *   4. What's on      → the rest of today's public program
 *   5. MastheadNotes  → dated local context that self-hides
 *   6. The full briefing + More for today (collapsed)
 *
 * (The generated "best move now" card was removed 2026-06-18: /today is a place
 *  to FIND what you need, not a suggestion engine that tells you an idea you
 *  may already have. Finding, not telling.)
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

  // ONE unified public event set — created here but intentionally NOT awaited.
  // The static page chrome (sky, headline, and dated local notes) must
  // paint on the first byte; each event-dependent region below awaits THIS one
  // shared promise inside its own <Suspense> boundary, so a cold ISR miss
  // streams the rail in progressively instead of blocking the whole shell on
  // the slowest feed. The promise resolves once even though several regions
  // await it (assembleUnifiedEvents is itself unstable_cache-wrapped, and a
  // single awaited promise yields one result). (Audit: unified-events
  // cold-miss streaming gap.)
  const eventsPromise = assembleUnifiedEvents(now);

  // ── EVENING GEAR ────────────────────────────────────────────────────────
  // After 5 PM Eastern the page shifts what leads: the reader's question is
  // no longer "what is my day like" but "what is on tonight." Server-side
  // on the Eastern wall clock (the page ISRs every 300s, so the flip lands
  // within minutes of 5 PM):
  //   before 17:00 — current order: Available now (KeysScore + OnNowBand),
  //                  then the headliner directly under it, golden hour, then
  //                  the day program.
  //   from   17:00 — the ON TONIGHT block (headliner + tonight rows) moves
  //                  directly under the sky hero; Available now (happy hours,
  //                  deals, markets, parking) follows it; everything else
  //                  keeps its relative order below.
  // Emphasis re-composition only — every section renders in both gears, and
  // each event-dependent region still awaits the ONE shared events promise
  // inside its own <Suspense>, so the streaming shape is unchanged.
  const eveningGear = easternStartHour(now.toISOString()) >= 17;

  // The one headliner (splitTonightFeature's pick, drawn from the same shared
  // promise). Null fallback: a quiet day must never stream in a hero-shaped
  // skeleton it then takes away.
  const headliner = (
    <Suspense fallback={null}>
      <TonightHeadliner eventsPromise={eventsPromise} now={now} />
    </Suspense>
  );

  // Current utility belongs beside the calendar. Every live claim uses a
  // clock-checked window, while parking and later markets keep their
  // published timing. The shared event promise prevents duplicate feed
  // work across this band and the event program.
  const availableNow = (
    <>
      <div className="[&:not(:empty)]:mt-4">
        <KeysScore />
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
          <section className="mt-5 space-y-3" aria-label="Events today">
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
      <PageBloom />

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
            {/* Dateline, not the daypart: the h1 already names the moment
                ("This afternoon…"), so a daypart kicker here just said it
                twice. The date is the one thing the header wasn't showing and
                the field-guide way to date the front door. */}
            <div aria-hidden className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
              <span className="h-[3px] w-7 rounded-full" style={{ background: "var(--app-brand)" }} />
              {formatEasternDateline(now)}
            </div>
            <h1 className="font-serif text-[22px] font-semibold leading-none tracking-tight sm:text-[26px]" style={{ color: "var(--app-ink)" }}>
              {frame.title}
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              {frame.sub}
            </p>
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
      <SkyHero className="shader-rim relative z-10">
        <Link
          href="/pulse?open=weather"
          prefetch={false}
          aria-label="Open the full forecast"
          className="group relative block outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          <Suspense fallback={<Skeleton.Block height={110} round="var(--app-radius-md)" />}>
            <TodayCard />
          </Suspense>
          <ChevronRight
            aria-hidden
            strokeWidth={2.25}
            className="absolute bottom-2 right-2 h-4 w-4 opacity-50 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </SkyHero>

      {/* ASK RADIUS — the compact handoff into the decision workspace, moved
          directly BELOW the weather (owner, 2026-07-20: "move ask radius to
          below the weather") so the day's headline is immediately followed by
          "ask me anything about Frederick." */}
      <TodayAsk />

      {/* BROWSE PLACES BY WHAT YOU WANT — the "I want…" category fast lane
          (CravingStrip), high under the weather. Now behind an OBVIOUS tappable
          launcher card (owner: the plain text title "didn't make it clear what
          it is or that it's clickable"). Markup ships in the HTML (display:none
          until opened), so it opens instantly with no fetch. */}
      <BrowsePlacesDisclosure>
        <CravingStrip />
      </BrowsePlacesDisclosure>

      {/* ── LENS PICKER removed (2026-07-01, owner call) ───────────────────
          The visible Resident/Visitor toggle asked strangers to classify
          themselves before seeing any value, and most people never touch a
          toggle. /today now serves ONE unified view for everyone. The mode
          machinery stays alive but SILENT: useMode still leans the MAP's
          default layer set by geolocation (in-county → resident set), with no
          user-facing chooser. (Section ids stay on their divs so deep-link
          anchors like /today#whats-on still work.) */}

      {/* ── TOMORROW — a forward answer for the night owl. Self-hides during
          the day; once it's past ~9 PM (the "late" daypart, strictly on the
          Eastern clock) it leads the editorial spine with tomorrow's top draw +
          weather look, so a spent day isn't a dead end. It keeps this slot in
          BOTH gears: through the true evening (5-9 PM) it renders nothing, and
          late at night tomorrow's answer belongs above tonight's leftovers. */}
      <Suspense fallback={null}>
        <TomorrowPreview now={now} eventsPromise={eventsPromise} />
      </Suspense>

      {/* The two gears — see the EVENING GEAR note above. Same sections, same
          Suspense boundaries, different order. TodayAsk moved OUT of the gears
          to sit directly below the weather (owner call); GoldenHourCard
          self-hides outside its window. */}
      {eveningGear ? (
        <>
          {headliner}
          {whatsOn}
          {availableNow}
          <GoldenHourCard now={now} />
        </>
      ) : (
        <>
          {availableNow}
          {headliner}
          <GoldenHourCard now={now} />
          {whatsOn}
        </>
      )}

      {/* ── LOWER PAGE, reordered with an argument (Jul 2026 rework): open-now
          places → your own saved → an idea → the day's pick → sometimes-on
          context → good-to-have utilities → weather depth. Each section reads at
          one of two type registers (SectionHeading lg/sm), so hierarchy comes
          from typography, not five competing header styles. ─────────────────── */}

      {/* RIGHT NOW, AROUND HERE — the daypart's most-wanted PLACES, open now
          (owner ask 2026-07-20: list the common AM / midday / evening needs).
          Rows built server-side; self-hides when nothing in the daypart is open.
          Its lead rail de-dupes against the CravingStrip "I want…" lead above,
          so the page never says "dinner" twice back-to-back (buildDaypartRows). */}
      <DaypartNeeds rows={buildDaypartRows(now)} />

      {/* FROM YOUR SAVED + the save-derived shortcut, kept together (both read
          the user's own saves): the returning user's open-now saved places, then
          the one quiet "you keep a lot of ___" nudge. Each self-hides
          independently, so an honest empty state never shows a box. */}
      <FromYourSaved />
      <TasteNudge />

      {/* NEED AN IDEA — the editorial collections rail (one of the two rails, now
          separated from the daypart rail by the saved list above). */}
      <Suspense
        fallback={
          <section className="mt-6" aria-label="Need an idea?">
            <Skeleton.Block height={120} round="var(--app-radius-lg)" />
          </section>
        }
      >
        <CuratedPicks />
      </Suspense>

      {/* WORTH A LOOK — the daily rotation, demoted from a third swipe rail to a
          calm vertical list so the eye doesn't hit three rails in a row. */}
      <Suspense fallback={<Skeleton.Block height={180} round="var(--app-radius-lg)" />}>
        <WorthALook />
      </Suspense>

      {/* ── SOMETIMES-ON CLUSTER — the dated and seasonal beats, grouped so the
          "here sometimes" context sits together instead of interrupting the core
          sections. Each self-hides out of its window. */}
      {/* LOOKING AHEAD — the weekend teaser on Thu/Fri mornings. */}
      <Suspense fallback={null}>
        <WeekendPreview now={now} eventsPromise={eventsPromise} />
      </Suspense>
      {/* Seasonal pools (summer only; self-hides out of season). */}
      <PoolsToday now={now} />
      {/* Rare dated context: holiday, school, creek, and community notes. */}
      <MastheadNotes now={now} />

      {/* "What's happening around you" (NearbyNow) was removed from /today
          (owner call): the craving grid + Today's Deals already answer "near
          me now," and the around-you geo surface duplicated that. It still
          lives on the map. */}

      {/* GOOD TO HAVE — the standing local utilities, lifted OUT of the old
          "More weather & local tools" drawer (they were never weather, and a
          visitor never found "where to stay" behind a weather label). One
          VISIBLE zone under a single secondary heading, then the toolbox door,
          so the bottom of the page reads as a calm essentials shelf. */}
      <section aria-label="Essentials" className="mt-6">
        <SectionHeading size="sm" title="Essentials" />
        <div className="mt-3 space-y-3">
          {/* Emergency essentials lead the shelf — the one utility a visitor
              most needs to have found BEFORE the moment they need it (beta
              safety request). Where to stay, the food-truck roster, and the
              parking / reservations hand-offs follow. */}
          <EmergencyPrompt />
          <VisitorStayPrompt />
          <FoodTruckToday />
          <PartnerAppsRow />
        </div>
      </section>

      {/* THE TOOLBOX — the calm door into the full Compass directory, part of
          the same good-to-have zone. Every subject group is one tap away. */}
      <ToolboxTeaser />

      {/* WEATHER DETAILS — the one honest collapse, now weather-only: the
          hourly / 7-day disclosure pills and the forecast/almanac hand-off.
          The utilities that used to share this drawer moved up into "Good to
          have"; the label now says exactly what is inside. */}
      <CollapsibleSection
        title="Weather details"
        storageKey="fr.today.briefing"
        defaultOpen={false}
        className="mt-6 border-t pt-2"
      >
      <div className="mt-2 space-y-3">
      {/* /today keeps the cinematic sky at the top of the page; this collapse
          holds the DETAILED forecast — the hourly / 7-day pills — for readers
          who want depth, then hands off to /pulse for the full almanac. */}
      <div className="relative">
        {(() => {
          // Sky-aware wash on the weather sub-card stack so the
          // supplemental cards (Hourly / Weekly / More Details) read
          // as part of the same atmospheric scene as the SkyHero
          // above instead of a flat paper break. Tint is the BOTTOM
          // stop of the current time-of-day sky (the most-desaturated
          // stop, so it doesn't fight the chrome inside the cards),
          // mixed at 9-14% into the elevated paper bg. Fades to plain
          // elevated by ~75% so the bottom of the stack stays neutral
          // and dividers + ink stay easy to read.
          const sky = currentSkyPalette();
          const strength = sky.tone === "dark" ? 14 : 10;
          const stackBg = `linear-gradient(180deg, color-mix(in srgb, ${sky.bottom} ${strength}%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 75%)`;
          return (
            <div className="deck-card mt-3 rounded-[var(--app-radius-lg)]">
            <div
              className="relative z-0 overflow-hidden rounded-[var(--app-radius-lg)] border [&_>_*:not(:last-child)]:border-b"
              style={{
                borderColor: "var(--app-border)",
                background: stackBg,
              }}
            >
          {/* (CivicAlerts moved UP to the top-level "Heads up" slot — an
              active warning belongs before the plan, not inside the
              collapsed weather panel.) */}
          {/* All three weather subsections (Hourly · 7-Day · More
              Details) are disclosure pills for visual uniformity, and
              all three default CLOSED — each collapsed pill carries a
              real summary ("12 hours, peaks 80° at 7 PM"), so the
              panel stays compact and the page opens light on weather.
              Each remembers the user's expand choice in localStorage. */}
          <HourlyDisclosure
            summary={
              <Suspense fallback={<Skeleton.Block height={14} width="68%" round="var(--app-radius-sm)" />}>
                <HourlySummary />
              </Suspense>
            }
          >
            <Suspense fallback={<Skeleton.Block height={92} round="0" />}>
              <HourlyForecast />
            </Suspense>
          </HourlyDisclosure>
          <WeeklyCard
            summary={
              <Suspense fallback={<Skeleton.Block height={14} width="68%" round="var(--app-radius-sm)" />}>
                <WeeklySummary />
              </Suspense>
            }
          >
            <Suspense fallback={<Skeleton.Block height={260} round="0" />}>
              <WeeklyForecast />
            </Suspense>
          </WeeklyCard>
            </div>
            </div>
          );
        })()}
      </div>

      {/* Weather DEPTH (the multi-day strip + almanac grid) now lives on
          /pulse, the civic dashboard that owns it — /today keeps only the
          cinematic sky + the hourly / 7-day disclosure pills, then hands off.
          One link instead of a second weather app inside the front door. */}
      <Link
        href="/pulse?open=weather"
        className="tap-44 mt-1 inline-flex items-center gap-1 px-1 text-[13px] font-semibold"
        style={{ color: "var(--app-ink-3)" }}
      >
        Full forecast &amp; almanac
        <ArrowRight className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} aria-hidden />
      </Link>

      </div>
      </CollapsibleSection>

      {/* Closing beat — a quiet brand sign-off so the page ends on purpose
          instead of dropping straight from a collapsed row into the footer. */}
      <div className="mt-8 flex flex-col items-center gap-2 pb-2 text-center">
        <span aria-hidden className="h-[3px] w-8 rounded-full" style={{ background: "var(--app-brand)" }} />
        <p className="font-serif text-[15px]" style={{ color: "var(--app-ink-3)" }}>
          Around here.
        </p>
      </div>
    </EventSheetBoundary>
  );
}

// ─── Event-dependent slices ──────────────────────────────────────────────
// Thin async server components that each await the ONE shared events promise
// and render an existing leaf component with its existing props. Moving the
// await + derivation off HomePage into these <Suspense>-bounded children is
// what lets the static chrome paint before the feeds resolve; the leaf
// components (TodayCard / TodayContext / RightNowBand) are unchanged.

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/** Town label for an event. Downtown-aware (owner call, 2026-07-20:
 *  "downtown only when true"): a Frederick-city event whose point falls inside
 *  the historic-core geofence reads "Downtown Frederick"; anywhere else in the
 *  city stays "Frederick" (no overclaim for Golden Mile / west-side venues).
 *  Other towns pass through. Null when the town is unknown. */
function eventTown(ev: { municipality_name?: string; municipality?: string; geom?: LngLat | null }): string | null {
  const t = ev.municipality_name?.trim();
  if (!t) return null;
  if (ev.municipality === "frederick") {
    return isDowntownFrederick(ev.geom ?? null) ? "Downtown Frederick" : "Frederick";
  }
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

/** The one today-program derivation, read by BOTH the page headliner and the
 *  What's-on program. Pure and cheap: the two Suspense regions await the SAME
 *  shared events promise and call this on its single resolved value, so they
 *  can never disagree about which event is the headliner or which rows remain. */
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

/** ONE-HERO composition, part 1: the page headliner. When today has a real
 *  draw (splitTonightFeature's pick — utility and routine programming never
 *  qualify), it renders as THE headline of the page via TonightHeadline. On a
 *  quiet day this renders nothing at all — no faked hero — and WhatsOn says
 *  the quiet truth in its place. */
async function TonightHeadliner({ eventsPromise, now }: { eventsPromise: EventsPromise; now: Date }) {
  const { publicEvents } = await eventsPromise;
  const { feature } = deriveTodayProgram(publicEvents, now);
  if (!feature) return null;
  return <TonightHeadline event={feature} now={now} />;
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
  const { publicEvents } = await eventsPromise;
  // (The overnight "First thing tomorrow" strip that used to live here grew into
  // its own composed TomorrowPreview beat above — top draw + weather look, gated
  // on the same "late" daypart — so the tomorrow answer isn't duplicated.)
  // The headliner itself renders ONCE, at page level (TonightHeadliner); this
  // section carries the rest of the program. Same derivation, same promise.
  const { todayAll, ahead, feature, upcomingRest, remainingAlsoToday, remainingEarlierToday } =
    deriveTodayProgram(publicEvents, now);
  const featureDuplicateCount = feature
    ? Math.max(0, todayAll.filter((event) => isSameTodayListing(event, feature)).length - 1)
    : 0;
  const visibleTodayCount = todayAll.length - featureDuplicateCount;

  // The day PROGRAM (replaced the unlabeled sideways rail + separate "Also
  // today" bucket, owner call 2026-07-15: "feels like a list with no
  // understanding of what's in the list"). One chronological spine, grouped
  // by daypart, draws and quiet civic/routine rows interleaved at their real
  // times — the tier survives as typography (weight + ink), not as a second
  // mystery list. A vertical column also shows the whole evening at a
  // glance where the rail hid all but two tiles.
  const program = [
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

  return (
    <section className="mt-5 space-y-3" aria-label="Events today">
      <DismissibleSection
        id="upcoming"
        title="Events today"
        href="/events"
        cta="See all"
        flat
        meta={
          visibleTodayCount > 0
            ? `${visibleTodayCount} ${visibleTodayCount === 1 ? "event" : "events"} today${tonightCount > 0 ? ` · ${tonightCount} tonight` : ""}`
            : undefined
        }
      >
        {upcomingRest.length > 0 || remainingAlsoToday.length > 0 || remainingEarlierToday.length > 0 ? (
          <div className="space-y-3">
            {/* ONE-HERO composition, part 2: the quiet-day truth. When no real
                draw earned the page headline, say so plainly instead of
                promoting a routine row into a fake hero; the quiet program
                rows below and the week content further down carry the page. */}
            {!feature && (
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
        ) : feature ? (
          /* The headliner above is the whole calendar — an honest one-liner,
             not an "empty" claim the hero itself contradicts. */
          <p className="text-body py-4" style={{ color: "var(--app-ink-3)" }}>
            Nothing else is on the calendar today.
          </p>
        ) : (
          <p
            className="text-body py-4"
            style={{ color: "var(--app-ink-3)" }}
          >
            No events are on the calendar today.{" "}
            <Link href="/events" className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
              Browse all events
            </Link>
            .
          </p>
        )}
      </DismissibleSection>
    </section>
  );
}
