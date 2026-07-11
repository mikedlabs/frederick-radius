import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import TodayCard from "@/components/today/TodayCard";
import TodayAsk from "@/components/today/TodayAsk";
import EventCountdown from "@/components/today/EventCountdown";
import { Ticket, ChevronRight } from "lucide-react";
import MastheadTitle from "@/components/today/MastheadTitle";
import ShareTodayButton from "@/components/today/ShareTodayButton";
import { easternDayKey } from "@/lib/tz";
import OnNowBand from "@/components/today/OnNowBand";
import OnNowStrip from "@/components/today/OnNowStrip";
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
import KeysCard from "@/components/today/KeysCard";
import { isKeysEvent } from "@/lib/today/keysEvent";
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

import { eventDateBlock } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { liveMusicTonight } from "@/lib/events/live-music";
import RightNowBand from "@/components/now/RightNowBand";
import { isUtilityEvent } from "@/lib/event-kind";
import { compareForLead, isRoutineProgram } from "@/lib/events/lead-rank";
import { pickGoldenHourOutdoorEvent } from "@/lib/events/golden-pairing";
import { FREDERICK_CENTER, isValidCoord } from "@/lib/geo";
import { isEventToday, isEventEnded, eventWhenLabel } from "@/lib/eventWhenLabel";
import { pickTonightEvent } from "@/lib/today/tonight";
import { daypart, sectionOrder, type TodaySection } from "@/lib/daypart";
import CravingStrip from "@/components/now/CravingStrip";
import PoolsToday from "@/components/today/PoolsToday";
import FoodTruckToday from "@/components/today/FoodTruckToday";
import FreshnessGuard from "@/components/today/FreshnessGuard";
import TomorrowPreview from "@/components/today/TomorrowPreview";
import GoldenHourCard from "@/components/today/GoldenHourCard";
import EventWalkTime from "@/components/today/EventWalkTime";

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
// generateMetadata (not a static object) so the share card is the DAILY
// almanac card: the Eastern day is baked into the image URL, which makes
// each day a distinct URL — social caches can never serve yesterday's
// "today". Regenerates on the page's own ISR cadence (300s), so the URL
// rolls over within minutes of midnight Eastern.
export async function generateMetadata(): Promise<Metadata> {
  const day = easternDayKey(new Date());
  const description =
    "What's open, what's happening, and what's worth your time in Frederick County right now.";
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


// pickTonightEvent + its NON_PUBLIC_EVENT filter moved to src/lib/today/tonight
// so the SkyHero teaser, the What's-On feature, AND the composed "right now"
// line (NowIntel) all speak ONE agreed headliner instead of re-deriving it.

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
        <Suspense fallback={<Skeleton.Block height={110} round="var(--app-radius-md)" />}>
          <TodayCard />
        </Suspense>
      </SkyHero>

      {/* ── ASK — the core promise, finally on the front door (UX-01 p1).
          AskFrederick → /api/ask was fully built but had zero importers;
          the July 2026 review called it the killer finding. Under the sky
          hero so "what's my day look like" still leads, then the open
          question, then tonight's answer. */}
      <TodayAsk />

      {/* ── TONIGHT, SOLO — the headline event used to sit as a frosted pill
          INSIDE the weather card; owner call (2026-07-10): it reads better as
          its own card directly below the weather, in the standard elevated
          card language. Self-hides when nothing qualifies. */}
      <Suspense fallback={null}>
        <TonightSolo eventsPromise={eventsPromise} now={now} />
      </Suspense>

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
        {/* The FirstVisitNote standfirst ("From Downtown to the surrounding
            towns…") was cut here (Jul-8 audit): first visit is exactly when the
            welcome line above the sky ALSO renders, so two identity sentences
            sandwiched the hero saying the same thing. The welcome line is the
            one identity beat; the masthead stays personal, not promotional. */}
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
        {/* The cap rule now carries the day's one share affordance: the link
            previews as the daily almanac card (generateMetadata above), so
            "Share today" drops an engraved sun/moon/events plate into the
            group chat. Quiet by design — it caps the plate, it doesn't sell. */}
        <div className="mt-3 flex items-center gap-3">
          <div className="fg-rule min-w-0 flex-1" aria-hidden />
          <ShareTodayButton />
        </div>
      </header>

      {/* ── ON NOW, NEAR YOU — a compact live strip in the gap the copy-heavy
          "Market season" seasonal band used to fill (owner call, 2026-07-08:
          the band read as brochure prose). Two or three TAPPABLE chips of what
          is genuinely on THIS MINUTE — a live event, a place open now (a happy
          hour pouring), today's farmers market if one is actually open — each
          linking to its surface. Honest + self-hiding: shows only what's real,
          and the whole strip disappears (no empty box) when nothing qualifies.
          Streams on the shared events promise. */}
      <Suspense fallback={null}>
        <OnNowStrip now={now} eventsPromise={eventsPromise} />
      </Suspense>

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
          contextSlot={
            <Suspense fallback={null}>
              <RightNowSlot eventsPromise={eventsPromise} now={now} />
            </Suspense>
          }
        />
      </div>

      {/* ── TOMORROW — a forward answer for the night owl. Self-hides during
          the day; once it's past ~9 PM (the "late" daypart, strictly on the
          Eastern clock) it leads the editorial spine with tomorrow's top draw +
          weather look, so a spent day isn't a dead end. */}
      <Suspense fallback={null}>
        <TomorrowPreview now={now} eventsPromise={eventsPromise} />
      </Suspense>

      {/* ── EDITORIAL SPINE, DAYPART-ORDERED — the SAME daypart spine the On-now
          band orders by, lifted to the page's two swappable sections. Morning /
          midday lead with the day-ahead plan (Plan the moment: walkable date
          night, kid energy burners, rainy-day, hidden gems — pure
          discoverability of /collections, no client JS); evening / late lead
          with tonight's events (the headline answer, soonest first, the rest one
          tap away via "See all"). Both always render — daypart only picks which
          comes first, so the page BEHAVES like a local instead of saying so.
          What's-on streams inside its own Suspense boundary. */}
      {sectionOrder(daypart(now)).map((section: TodaySection) =>
        section === "curated" ? (
          <CuratedPicks key="curated" />
        ) : (
          <div key="whats-on" id="whats-on" style={{ scrollMarginTop: "calc(var(--app-topbar-h, 56px) + 12px)" }}>
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
        ),
      )}

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
      {/* Golden hour — a calm almanac beat in the live layer: today's sunset +
          the ~hour of good light before it (real NOAA sun math). Self-hides
          outside the pre-sunset window, so it appears exactly when it's the most
          decision-useful — and romantic — number on the page. */}
      <GoldenHourCard now={now} />

      {/* Live Keys score — client island that self-hides unless there's a game
          today (home or away). Polls only while the game is live. Leads the live
          layer because a game in progress is the most time-sensitive thing on
          the page. The [&:not(:empty)] wrapper costs an idle day zero space. */}
      <div className="[&:not(:empty)]:mt-4">
        <KeysScore />
      </div>

      <div className="mt-4" id="on-now" style={{ scrollMarginTop: "calc(var(--app-topbar-h, 56px) + 12px)" }}>
        <Suspense fallback={null}>
          {/* marketTeaserAbove: the OnNowStrip up top is the canonical market
              teaser — it chips today's market whenever marketsOpenToday finds
              one, which is exactly when the band's MarketsTodayBeat line would
              render. Telling the band the strip has it means the market fact
              lives ONCE on /today (the July audit caught it rendering three
              times) while /today keeps the richer /category/market door via
              the chip itself. */}
          <OnNowBand now={now} eventsPromise={eventsPromise} marketTeaserAbove />
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

/** Tonight's headline event as its OWN card directly below the weather hero
 *  (owner call: out of the weather card, solo). Today-only AND not-yet-ended:
 *  the picker enforces the "next 24 hours" contract; renders nothing when no
 *  event qualifies, so the page never shows an empty shell. */
async function TonightSolo({ eventsPromise, now }: { eventsPromise: EventsPromise; now: Date }) {
  const { publicEvents } = await eventsPromise;
  const ev = pickTonightEvent(now, publicEvents);
  if (!ev) return null;
  return (
    <Link
      href={`/events/${ev.slug}`}
      className="tactile-interactive group relative z-10 mt-2.5 flex items-center gap-3 rounded-[var(--app-radius-md)] px-3 py-2.5"
      style={{
        backgroundColor: "var(--app-bg-elevated-solid)",
        backgroundImage: "var(--app-paper-light)",
        boxShadow: "var(--app-elev-1), var(--app-hi), var(--app-edge)",
      }}
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
        style={{
          background: "color-mix(in srgb, var(--app-brand-2) 14%, var(--app-bg-elevated))",
          boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 8%, transparent), var(--app-hi)",
          color: "color-mix(in srgb, var(--app-brand-2) 80%, var(--app-ink))",
        }}
      >
        <Ticket className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
          {eventWhenLabel(ev.starts_at, now)}
          <EventCountdown startsAt={ev.starts_at} endsAt={ev.ends_at ?? ev.starts_at} />
        </span>
        <span className="block truncate font-serif text-[15.5px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          {ev.title}
        </span>
        {ev.venue_name && (
          <span className="block truncate text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            {ev.venue_name}
          </span>
        )}
      </span>
      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5"
        strokeWidth={2}
        style={{ color: "var(--app-ink-3)" }}
      />
    </Link>
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
  // The photo-card rail is for DRAWS only. Routine recurring programming
  // (storytime, ESL class, tech help — the standing library calendar) used to
  // ride the same rail in the same card language as tonight's headline acts,
  // flattening the hierarchy; it now joins civic business in the quiet
  // "Also today" line list, ordered by start time.
  const todaysEvents = ahead
    .filter((e) => !isUtilityEvent(e) && !isRoutineProgram(e))
    .sort(compareForLead);
  const alsoToday = ahead.filter((e) => isUtilityEvent(e) || isRoutineProgram(e));
  const earlierToday = ended.filter((e) => !isUtilityEvent(e));
  // (The overnight "First thing tomorrow" strip that used to live here grew into
  // its own composed TomorrowPreview beat above — top draw + weather look, gated
  // on the same "late" daypart — so the tomorrow answer isn't duplicated.)
  const featuredEvent = pickTonightEvent(now, publicEvents);
  // The SkyHero teaser (TonightTeaser) already carries pickTonightEvent's #1,
  // so the feature card here takes the NEXT-best draw and the rail carries the
  // rest — one event never renders twice on one page (the Jul-8 audit render
  // showed the same reading as the hero's tappable row AND the big photo
  // feature two screens later). When there's no teaser there's no feature
  // card either, same as before.
  const withoutTeaser = featuredEvent
    ? todaysEvents.filter((e) => e.slug !== featuredEvent.slug)
    : todaysEvents;
  const feature = featuredEvent ? withoutTeaser[0] : undefined;
  const upcomingRest = feature ? withoutTeaser.slice(1) : withoutTeaser;
  // Cap the rail: ~5,600px of sideways scroll (the July audit measured ~20
  // tiles) buries the "See all" door. Eight draws is a real shelf; the
  // overflow closes the rail as an honest "+N more today" stub into /events.
  const RAIL_MAX = 8;
  const railEvents = upcomingRest.slice(0, RAIL_MAX);
  const railOverflow = upcomingRest.length - railEvents.length;

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
        {feature || upcomingRest.length > 0 || alsoToday.length > 0 || earlierToday.length > 0 ? (
          <div className="space-y-3">
            {feature && (
              isKeysEvent(feature)
                ? <KeysCard event={feature} variant="feature" />
                : <EventCard event={feature} variant="feature" />
            )}
            {railEvents.length > 0 && (
              <div className="-mx-4 px-4">
                <div className="reveal-up shelf-rail gap-3 pb-1">
                  {railEvents.map((e) => (
                    <div key={`${e.slug}-${e.starts_at}`} className="w-[280px] shrink-0">
                      <div className="tactile-ring rounded-[var(--app-radius-lg)]">
                        {isKeysEvent(e)
                          ? <KeysCard event={e} variant="tile" />
                          : <EventCard event={e} variant="tile" />}
                      </div>
                      {/* Real walk minutes from the user's cached fix (LocationPrime
                          consent), for precisely-located venues only — the single
                          most decision-useful number on a downtown event tile.
                          Client + self-hiding: no fix, or no precise coordinate,
                          renders nothing. Never fabricated. */}
                      {hasPreciseGeo(e) && <EventWalkTime dest={e.geom} />}
                    </div>
                  ))}
                  {/* End-cap stub: the honest close of a capped shelf — the mono
                      count says how much of today didn't fit, and the whole
                      tile is the door to /events. Quiet by design (dashed
                      hairline, no photo) so it reads as an edge, not a peer. */}
                  {railOverflow > 0 && (
                    <div className="flex w-[150px] shrink-0 self-stretch">
                      <Link
                        href="/events"
                        className="tactile-interactive flex min-h-[160px] w-full flex-col items-center justify-center gap-0.5 rounded-[var(--app-radius-lg)] border border-dashed px-3"
                        style={{
                          borderColor: "color-mix(in srgb, var(--app-ink) 22%, transparent)",
                          background: "color-mix(in srgb, var(--app-ink) 3%, transparent)",
                        }}
                      >
                        <span className="font-mono text-[17px] font-bold tabular-nums leading-none" style={{ color: "var(--app-ink)" }}>
                          +{railOverflow}
                        </span>
                        <span className="text-[12px] font-semibold leading-snug" style={{ color: "var(--app-ink-2)" }}>
                          more today
                        </span>
                        <span aria-hidden className="mt-1 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                          →
                        </span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Civic / municipal business + routine recurring programs
                happening today — present but quiet, as muted one-line rows so
                they never compete with the draws. */}
            {alsoToday.length > 0 && (
              <div className="space-y-1">
                <p className="px-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                  Also today
                </p>
                <ul>
                  {alsoToday.map((e) => (
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
