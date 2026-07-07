import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import TodayCard from "@/components/today/TodayCard";
import MastheadTitle from "@/components/today/MastheadTitle";
import OnNowBand from "@/components/today/OnNowBand";
import KeysScore from "@/components/today/KeysScore";
import SkyHero, { currentSkyPalette } from "@/components/today/SkyHero";
import TodayContext from "@/components/today/TodayContext";
import LocationPrime from "@/components/today/LocationPrime";
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
import PageBloom from "@/components/ui/PageBloom";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import Skeleton from "@/components/ui/Skeleton";
import HourlyForecast from "@/components/today/HourlyForecast";
import HourlyDisclosure from "@/components/today/HourlyDisclosure";
import HourlySummary from "@/components/today/HourlySummary";
import WeeklyForecast from "@/components/today/WeeklyForecast";
import WeeklyCard from "@/components/today/WeeklyCard";
import WeeklySummary from "@/components/today/WeeklySummary";
import BetaIntroCard from "@/components/today/BetaIntroCard";
import VisitorStayPrompt from "@/components/today/VisitorStayPrompt";
import WorthALook from "@/components/today/WorthALook";
import FromYourSaved from "@/components/today/FromYourSaved";
import TasteNudge from "@/components/today/TasteNudge";
import CuratedPicks from "@/components/today/CuratedPicks";
import PartnerAppsRow from "@/components/today/PartnerAppsRow";
// CreekHairline removed in the pleasant-layout pass — it was a
// decorative divider between weather/discovery and action; the
// reorder makes the divider unnecessary.

import { eventDateBlock, type EventWithMeta } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { liveMusicTonight } from "@/lib/events/live-music";
import RightNowBand from "@/components/now/RightNowBand";
import { isUtilityEvent } from "@/lib/event-kind";
import { compareForLead, pickLeadEvent } from "@/lib/events/lead-rank";
import { pickGoldenHourOutdoorEvent } from "@/lib/events/golden-pairing";
import { FREDERICK_CENTER } from "@/lib/geo";
import { isEventToday, isEventEnded } from "@/lib/eventWhenLabel";
import { easternParts, easternDayKey } from "@/lib/tz";
import CravingStrip from "@/components/now/CravingStrip";
import PoolsToday from "@/components/today/PoolsToday";
import FoodTruckToday from "@/components/today/FoodTruckToday";
import FreshnessGuard from "@/components/today/FreshnessGuard";
import FirstVisitNote from "@/components/today/FirstVisitNote";
import NowIntel from "@/components/today/NowIntel";

/**
 * Now — the daily briefing.
 *
 * Spine (post-findability pass, top to bottom — matches the render below):
 *
 *   1. SkyHero        → time-of-day sky + date/clock + tonight teaser
 *   2. TodayContext   → slim salutation + golden-hour cue (self-hides)
 *   3. CravingStrip   → "I want…" bar (LocationPrime consent pill on its
 *                        right) + cravings grid + a "Getting around" row
 *   4. CivicAlerts    → worst-first heads-up (self-hides)
 *   5. What's on      → every public event in the city/county TODAY (no toggle)
 *   6. OnNowBand      → the live layer (markets · happy hour · specials · parking)
 *                        under one header, reordered by daypart (self-hides)
 *   7. The full briefing + More for today (collapsed)
 *
 * (The generated "best move now" card was removed 2026-06-18: /today is a place
 *  to FIND what you need, not a suggestion engine that tells you an idea you
 *  may already have. Finding, not telling.)
 *
 * What got cut in this pass:
 *   • Answers lead (AnswerCards) — the section only ever rendered the
 *                                  "On tonight" card (open-now + weekend
 *                                  answers were already removed); the
 *                                  tonight teaser already lives in the
 *                                  SkyHero, so the duplicate card went.
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
export const metadata: Metadata = {
  alternates: { canonical: "/today" },
  title: "Today in Frederick County",
  description: "What's open, what's happening, and what's worth your time in Frederick County right now.",
  openGraph: {
    title: "Today in Frederick County",
    description: "What's open, what's happening, and what's worth your time in Frederick County right now.",
  },
};


// Event titles that look like internal/admin business — board meetings,
// hearings, classes, rehearsals. Public meetings live on /events under
// their own section; they don't carry a "Don't miss" hero card.
// (EVENING_CATEGORIES + pickFeaturedCandidates retired in Push 2:
// RightNowStrip's "Weekend bet" card now carries the editorial-place
// answer. The filter logic moved into RightNowStrip's NIGHT_OUT_CATS.)
const NON_PUBLIC_EVENT = /\b(board|council|commission|hearing|workshop|rehearsal|board meeting|training|orientation|class|certification|breastfeeding|prenatal|birthing|info session|hr|policy)\b/i;

/** Tonight's marquee event: the best still-catchable DRAW happening TODAY.
 *
 *  History: this picker used to lead-rank a 72-hour pool, and its callers then
 *  nulled the result unless the winner started today — so whenever the ranked
 *  winner was a photo-backed Thursday event, the masthead showed NOTHING on a
 *  night with a live game downtown (the 7:55 PM audit render). It now filters
 *  FIRST — today's Eastern day, not yet ended, non-administrative — and
 *  lead-ranks inside that pool, so the hero is alive on exactly the nights it
 *  matters and can never carry an event the user already missed. If nothing
 *  qualifies, no hero: honest beats padded.
 */
function pickTonightEvent(now: Date, pool: EventWithMeta[]) {
  const tonight = pool.filter(
    (e) =>
      isEventToday(e.starts_at, now) &&
      !isEventEnded(e, now) &&
      !NON_PUBLIC_EVENT.test(e.title ?? ""),
  );
  // Lead-rank, not raw chronology: a photo-led draw, then any real draw, then a
  // routine recurring program (storytime/class) last — so the cron-ingested
  // library calendar (PR #894) can't put a storytime in the hero ahead of
  // tonight's carnival or concert.
  return pickLeadEvent(tonight);
}

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
  // The static page chrome (sky, headline, holiday note, the craving grid) must
  // paint on the first byte; each event-dependent region below awaits THIS one
  // shared promise inside its own <Suspense> boundary, so a cold ISR miss
  // streams the rail in progressively instead of blocking the whole shell on
  // the slowest feed. The promise resolves once even though several regions
  // await it (assembleUnifiedEvents is itself unstable_cache-wrapped, and a
  // single awaited promise yields one result). (Audit: unified-events
  // cold-miss streaming gap.)
  const eventsPromise = assembleUnifiedEvents(now);

  return (
    <div className="relative">
      {/* Document-outline anchor. The visible weekday/date in TodayCard is an
          editorial orientation line, not the page title, so the page carried
          no <h1>; this sr-only heading gives screen readers + crawlers a clean
          single top-level heading without changing the layout. */}
      <h1 className="sr-only">What&rsquo;s worth your time in Frederick County right now</h1>
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

      {/* ── WEATHER HERO — the time-of-day gradient sky + today's weather +
          tonight's event LEADS the page. Now a COMPACT, CONTAINED card (owner
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
      {/* ── WELCOME — the one-line answer to "what is this?" BEFORE anything
          else (owner ask, 2026-07-02). The July-1 call removed a brochure
          headline UNDER the hero because it pushed the answers down; this is
          the small version in the right place: one quiet line above the sky,
          serif claim + plain-sans promise, zero client JS. The top bar carries
          the name, so this states what the thing IS, not who it is. */}
      <p className="mb-2 px-0.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
        <span className="font-serif text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Downtown Frederick and the county, connected.
        </span>{" "}
        What&rsquo;s open, what&rsquo;s on, and what&rsquo;s worth your time.
      </p>

      <SkyHero className="shader-rim relative z-10">
        <Suspense fallback={<Skeleton.Block height={150} round="var(--app-radius-md)" />}>
          <TonightTeaser eventsPromise={eventsPromise} now={now} />
        </Suspense>
      </SkyHero>

      {/* ── MASTHEAD CAPTION ─────────────────────────────────────────────
          The identity standfirst, the holiday note, and the salutation /
          golden-hour line are FUSED into one engraved plate beneath the sky
          card — serif standfirst, then the mono almanac notes, capped by a
          fg-rule that reads as the cover/body break of the day's almanac.
          Previously these were three loose mt-blocks that read as a scattered
          stack; now they're one composed caption. Both the holiday and the
          context lines self-hide, so on an ordinary day the plate carries just
          the standfirst + the cap rule (which always sits below it, so the rule
          never dangles). Identity copy + voice unchanged (finding, not telling). */}
      <header className="mt-2 px-0.5">
        {/* Cover line, personalized: the brand line by default, the home town
            ("Middletown, today.") once one is set. Client swap post-mount; SSR
            keeps the brand line for crawlers. */}
        <MastheadTitle />
        {/* The descriptive standfirst orients a NEWCOMER; a returning daily user
            scrolls past it to reach the grid, so it shows on the first visit
            only and then retires itself (returning users never render it). */}
        <FirstVisitNote>
          <p className="mt-1 text-body text-pretty" style={{ color: "var(--app-ink-2)" }}>
            From Downtown to the surrounding towns: food, events, parks, shops, and the places worth your time, right now.
          </p>
        </FirstVisitNote>
        {/* The masthead almanac notes, capped + prioritized by MastheadNotes so
            the stack never piles up: at most one dated note (holiday / First
            Saturday / Pride / season) plus the streamed weather "duck inside"
            beat plus the always-on town picker. WeatherNudge and TodayContext are
            passed in PRE-SUSPENDED so MastheadNotes never awaits the forecast or
            the events feed (the plate paints first). */}
        {/* WeatherNudge ("Weather to duck." + a Rainy-day link) retired
            (owner call, 2026-07-02): the lead read as cryptic, and Plan the
            moment already carries the Rainy day Frederick collection — the
            masthead was double-selling one link. NowIntel still DESCRIBES
            adverse weather; the collection rail carries the action. */}
        <MastheadNotes
          now={now}
          contextSlot={
            <Suspense fallback={null}>
              <TodayContextSlot eventsPromise={eventsPromise} now={now} />
            </Suspense>
          }
        />
        <div className="fg-rule mt-3" aria-hidden />
      </header>

      {/* ── LENS PICKER removed (2026-07-01, owner call) ───────────────────
          The visible Resident/Visitor toggle asked strangers to classify
          themselves before seeing any value, and most people never touch a
          toggle. /today now serves ONE unified view for everyone. The mode
          machinery stays alive but SILENT: useMode still leans the MAP's
          default layer set by geolocation (in-county → resident set), with no
          user-facing chooser. (Section ids stay on their divs so deep-link
          anchors like /today#whats-on still work.) */}

      {/* ── ANSWER-FIRST LEAD removed (2026-06-17, owner call) ───────────
          The lead "answers" section only ever rendered the single "On
          tonight" card (the open-now and weekend answers were retired
          earlier, and parking/transit live as CravingStrip tiles). That
          tonight card duplicated the SkyHero's own tonight teaser, so the
          whole section + its buildTodayAnswers scaffolding came out. /today
          now leads straight into the CravingStrip fast lane below. */}

      {/* ── RIGHT NOW — the fast lane. "I want ___ right now" one-tap craving
          tiles into the nearest open one, plus a labeled "Getting around" row
          (Parking / MARC / Transit) so utilities don't read as cravings. The
          location consent now rides on the right of the "I want…" bar (one row,
          opposite the prompt) instead of a separate banner above it. */}
      <div className="mt-4" id="want" style={{ scrollMarginTop: "calc(var(--app-topbar-h, 56px) + 12px)" }}>
        <CravingStrip
          locationSlot={<LocationPrime />}
          intelSlot={
            <Suspense fallback={null}>
              <NowIntel now={now} />
            </Suspense>
          }
          contextSlot={
            <Suspense fallback={null}>
              <RightNowSlot eventsPromise={eventsPromise} now={now} />
            </Suspense>
          }
        />
      </div>

      {/* ── PLAN THE MOMENT — the editorial counterpart to the craving grid.
          Where "I want ___ right now" answers a single need, this surfaces the
          hand-picked collections (walkable date night, kid energy burners,
          rainy day, hidden gems) a beta review found personas hunting for in the
          category icons. Pure discoverability of content that already lives at
          /collections; server-rendered, no client JS. */}
      <CuratedPicks />

      {/* ── WHAT'S ON — every public event in the city or county TODAY. Moved
          ABOVE the moat (owner call): the day's events are the headline answer.
          Soonest first; the rest of the calendar is one tap away via "See all".
          Streamed: the section awaits the shared events promise inside its own
          Suspense boundary so the chrome above it never waits on the feeds. */}
      <div id="whats-on" style={{ scrollMarginTop: "calc(var(--app-topbar-h, 56px) + 12px)" }}>
        <Suspense
          fallback={
            <section className="mt-6 space-y-3" aria-label="What's on">
              <Skeleton.Block height={220} round="var(--app-radius-lg)" />
            </section>
          }
        >
          <WhatsOn eventsPromise={eventsPromise} now={now} />
        </Suspense>
      </div>

      {/* ── FROM YOUR SAVED — the save → resurface loop, lifted HERE (was below
          the live layer): a returning user's own saved places that are open
          RIGHT NOW are the highest-intent answer on the page, so they sit just
          under the day's events, above the general live layer. Client section
          (saves are client state); renders nothing unless something's open, so
          a first-timer or anyone with no open saves never sees a box. */}
      <FromYourSaved />

      {/* ── ON NOW — the live layer (farmers markets, happy hours, today's
          verified specials, tonight's parking play) gathered under ONE header
          instead of four free-floating beats, and REORDERED BY DAYPART so the
          most useful live thing leads at 8am vs 9pm. Each block still self-hides;
          the band header reads "On now" when something's genuinely live and
          "Coming up" when the only card is the next happy hour. Streams on the
          shared events promise (it needs tonight's events for the parking play). */}
      {/* Live Keys score — client island that self-hides unless there's a game
          today (home or away). Polls only while the game is live. Leads the live
          layer because a game in progress is the most time-sensitive thing on
          the page. The [&:not(:empty)] wrapper costs an idle day zero space. */}
      <div className="[&:not(:empty)]:mt-4">
        <KeysScore />
      </div>

      <div className="mt-4" id="on-now" style={{ scrollMarginTop: "calc(var(--app-topbar-h, 56px) + 12px)" }}>
        <Suspense fallback={null}>
          <OnNowBand now={now} eventsPromise={eventsPromise} />
        </Suspense>
      </div>

      {/* Seasonal pools (summer only; self-hides out of season) — placed BELOW
          the day's events and the happy-hour / on-now layer (owner call):
          swimming is a resident utility, not the headline, so it follows the
          draws instead of leading them. */}
      <PoolsToday now={now} />

      {/* TASTE-AWARE: a single quiet shortcut derived from the user's OWN saved
          places (their dominant craving), linking into /nearby for it. Client +
          self-hiding (renders nothing until the saves show a clear pattern), so
          it never weighs on a first-timer and never touches the I-want grid's
          first-paint path. Finding from the user's own signal, not telling. */}
      <TasteNudge />

      {/* "What's happening around you" (NearbyNow) was removed from /today
          (owner call): the craving grid + Today's Deals already answer "near
          me now," and the around-you geo surface duplicated that. It still
          lives on the map. */}

      {/* (HEADS UP / CivicAlerts moved UP to just under the masthead — an active
          warning belongs before anyone plans, not below the whole moat.) */}

      {/* The generated "best move now" card (TodayMoves) was removed
          2026-06-18: /today is a place to FIND, not a suggestion engine. A
          rule-based "here's the move" tells the user an idea they may already
          have; the fast-lane I-want grid, the live moat (happy hours/deals),
          tonight's event in the hero, and What's-on below already let them
          find their own answer. Finding, not telling. */}

      {/* (FROM YOUR SAVED moved UP to just under the day's events — a returning
          user's own open-now saves are the highest-intent answer, so they no
          longer sit below the whole live layer.) */}

      {/* WHAT'S ON was relocated ABOVE Happy hour (owner call 2026-06-19):
          today's events are the headline "what's happening" answer, so they now
          sit right after the I-want grid; the happy-hour / deals moat follows. */}

      {/* RESPONSIVE SPLIT (desktop only):
       *   mobile  : everything stacks single-column (space-y-6).
       *   lg+     : two-column grid — LEFT carries the day/weather
       *             stack (the "what's it like outside" answer);
       *             RIGHT carries the action stack (mood tiles,
       *             partner apps, WorthALook, events, From Above).
       * Each column keeps its own internal space-y-6 spine so the
       * vertical rhythm doesn't collapse at the breakpoint. */}
      {/* First-visit "New here?" intro — sits at the END of the primary
          content (was interrupting the answers → best-move flow up top).
          Dismissible; renders only until the cookie is set, so it never
          weighs on a returning visitor. */}
      <div className="mt-6">
        <BetaIntroCard />
      </div>

      {/* THE FULL BRIEFING — weather, events, and the rest, COLLAPSED by
          default so the first screen is just the ask + the answers. Depth
          is one tap away, not the opening wall. Reversible: flip
          defaultOpen, or lift any module back above to taste. */}
      <CollapsibleSection title="The full briefing" storageKey="fr.today.briefing" defaultOpen={false}>
      <div className="mt-2 flex flex-col gap-4">
        {/* ── LEFT column: the weather block. Leads on mobile (weather
            at the top, per the premium-refresh direction) and sits in
            the left column at lg+. ───────────────────────────────── */}
        <div className="space-y-4">
      {/* The sky-tinted weather hero (SkyHero + TodayCard) moved to the TOP
          of the page (owner call). This briefing column now holds the
          DETAILED forecast — the hourly / 7-day / more-details panel + the
          multi-day NowDayStrip — for readers who want depth. CivicAlerts
          lives in its own top-level "Heads up" slot above. */}
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
        <span aria-hidden>→</span>
      </Link>

        </div>{/* /LEFT column */}

        {/* ── RIGHT column: the action stack. Follows the weather on
            mobile; second column at lg+. stagger-children makes the
            section assemble itself — each card breathes in just after
            the last, so the page feels alive on arrival. ──────────── */}
        <div className="space-y-4 stagger-children">

      {/* The right column is now the SECONDARY stack: quick needs + the
       *  collapsed "more for today." "What's on" (the events answer) was
       *  lifted to a top-level section above the full briefing so the page
       *  reads Ask → best move → what's on → details, not a stacked
       *  dashboard with the answer buried in a column. */}

      {/* "Where to stay" door — now shown to everyone (the Resident/Visitor
          gate came out with the toggle). A local sending an out-of-town guest
          the link wants this too, so it's a standing card, not mode-gated. */}
      <VisitorStayPrompt />

      {/* ── MORE FOR TODAY — everything secondary, COLLAPSED by default.
          This is the de-clutter: partner apps, the surprise-me pick,
          local headlines, and the photography exit beat all live behind
          one tap instead of four scroll-screens. */}
      <CollapsibleSection
        title="More for today"
        storageKey="fr.today.more"
        defaultOpen={false}
      >
        <div className="space-y-4 pt-1">
          <FoodTruckToday />
          <PartnerAppsRow />
          <Suspense fallback={<Skeleton.Block height={250} round="var(--app-radius-lg)" />}>
            <WorthALook />
          </Suspense>
          {/* Local news moved to /pulse (the civic dashboard that owns it) and
              the From Above drone-book doorway moved off the front door — both
              are "check when curious," not "find something to do today." */}
        </div>
      </CollapsibleSection>

        </div>{/* /RIGHT column */}
      </div>{/* /responsive split */}
      </CollapsibleSection>
    </div>
  );
}

// ─── Event-dependent slices ──────────────────────────────────────────────
// Thin async server components that each await the ONE shared events promise
// and render an existing leaf component with its existing props. Moving the
// await + derivation off HomePage into these <Suspense>-bounded children is
// what lets the static chrome paint before the feeds resolve; the leaf
// components (TodayCard / TodayContext / RightNowBand) are unchanged.

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/** Masthead teaser: tonight's featured event, today-only. */
async function TonightTeaser({ eventsPromise, now }: { eventsPromise: EventsPromise; now: Date }) {
  const { publicEvents } = await eventsPromise;
  // Today-only AND not-yet-ended: the picker itself enforces the masthead's
  // "next 24 hours" contract, so no post-hoc nulling that could blank the
  // hero while something is live downtown.
  const featuredEvent = pickTonightEvent(now, publicEvents);
  return (
    <TodayCard
      tonightEvent={
        featuredEvent
          ? {
              slug: featuredEvent.slug,
              title: featuredEvent.title,
              venue_name: featuredEvent.venue_name ?? null,
              starts_at: featuredEvent.starts_at,
              ends_at: featuredEvent.ends_at ?? featuredEvent.starts_at,
            }
          : null
      }
    />
  );
}

/** Salutation + golden-hour cue (an outdoor draw still catchable in today's
 *  remaining daylight, paired with the live light window). Self-hides. */
async function TodayContextSlot({ eventsPromise, now }: { eventsPromise: EventsPromise; now: Date }) {
  const { publicEvents } = await eventsPromise;
  const goldenEvent = pickGoldenHourOutdoorEvent(publicEvents, now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  return <TodayContext goldenEvent={goldenEvent} />;
}

/** The contextual "right now" band: who's on stage tonight, as a quiet
 *  sub-label ("7:00 PM · Olde Mother"), never a count headline. Self-hides. */
async function RightNowSlot({ eventsPromise, now }: { eventsPromise: EventsPromise; now: Date }) {
  const { publicEvents } = await eventsPromise;
  const liveTonight = liveMusicTonight(publicEvents, now);
  const soonestShow = liveTonight[0];
  const soonest = soonestShow
    ? {
        title: soonestShow.title,
        venue: soonestShow.venue_name ?? null,
        time: eventDateBlock(soonestShow).time,
      }
    : undefined;
  return <RightNowBand liveTonight={{ count: liveTonight.length, soonest }} />;
}

/** What's on = every PUBLIC event in the city or county TODAY, soonest first.
 *  Draws (concerts/markets/shows) lead as cards; routine recurring programs
 *  sink to the end; civic/utility business shows quietly as "Also today". */
async function WhatsOn({ eventsPromise, now }: { eventsPromise: EventsPromise; now: Date }) {
  const { publicEvents } = await eventsPromise;
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
  const todaysEvents = ahead.filter((e) => !isUtilityEvent(e)).sort(compareForLead);
  const todaysCivic = ahead.filter((e) => isUtilityEvent(e));
  const earlierToday = ended.filter((e) => !isUtilityEvent(e));
  // OVERNIGHT (10 PM - 5 AM Eastern): today's rail is honest but thin — most
  // draws have ended and "what's worth your time right now" is usually
  // "sleep". Give the night owl tomorrow's answer: the first few lead-ranked
  // draws of the coming day, as a quiet strip. Empty outside the overnight
  // band, so daytime renders are untouched.
  const easternHour = easternParts(now).hour;
  const overnight = easternHour >= 22 || easternHour < 5;
  const tomorrowKey = easternDayKey(new Date(now.getTime() + 24 * 3_600_000));
  const firstTomorrow = overnight
    ? publicEvents
        .filter((e) => easternDayKey(new Date(e.starts_at)) === tomorrowKey && !isUtilityEvent(e))
        .sort(compareForLead)
        .slice(0, 3)
    : [];
  const featuredEvent = pickTonightEvent(now, publicEvents);
  const showHero = Boolean(featuredEvent && todaysEvents.some((e) => e.slug === featuredEvent.slug));
  const upcomingRest = showHero
    ? todaysEvents.filter((e) => e.slug !== featuredEvent!.slug)
    : todaysEvents;

  return (
    <section className="mt-6 space-y-3" aria-label="What's on">
      <DismissibleSection
        id="upcoming"
        title="Today"
        href="/events"
        cta="See all"
        eyebrow="What's on"
        plateNo="Pl. I"
      >
        {showHero || upcomingRest.length > 0 || todaysCivic.length > 0 || earlierToday.length > 0 || firstTomorrow.length > 0 ? (
          <div className="space-y-3">
            {showHero && featuredEvent && (
              <EventCard event={featuredEvent} variant="feature" />
            )}
            {upcomingRest.length > 0 && (
              <div className="-mx-4 px-4">
                <div className="reveal-up shelf-rail gap-3 pb-1">
                  {upcomingRest.map((e) => (
                    <div key={`${e.slug}-${e.starts_at}`} className="tactile-ring w-[280px] shrink-0 rounded-[var(--app-radius-lg)]">
                      <EventCard event={e} variant="tile" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Civic / municipal business happening today — present but quiet,
                as muted one-line rows so it never competes with the draws. */}
            {todaysCivic.length > 0 && (
              <div className="space-y-1">
                <p className="px-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                  Also today
                </p>
                <ul>
                  {todaysCivic.map((e) => (
                    <li key={`${e.slug}-${e.starts_at}`}>
                      <EventCard event={e} variant="utility" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Overnight only: tomorrow's first draws, so the 2 AM open isn't
                a dead end. Quiet one-liners; the full day is one tap away. */}
            {firstTomorrow.length > 0 && (
              <div className="space-y-1">
                <p className="px-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                  First thing tomorrow
                </p>
                <ul>
                  {firstTomorrow.map((e) => (
                    <li key={`${e.slug}-${e.starts_at}`}>
                      <EventCard event={e} variant="utility" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Finished draws, demoted to quiet one-liners: still the honest
                record of the day, never ranked over what's still catchable. */}
            {earlierToday.length > 0 && (
              <div className="space-y-1">
                <p className="px-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                  Earlier today
                </p>
                <ul>
                  {earlierToday.map((e) => (
                    <li key={`${e.slug}-${e.starts_at}`}>
                      <EventCard event={e} variant="utility" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p
            className="text-body py-4"
            style={{ color: "var(--app-ink-3)" }}
          >
            Nothing on the calendar today.{" "}
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
