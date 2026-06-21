import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import TodayCard from "@/components/today/TodayCard";
import TodaysDeals from "@/components/today/TodaysDeals";
import HappyHourWallet from "@/components/today/HappyHourWallet";
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
import HolidayNote from "@/components/today/HolidayNote";
import VisitorStayPrompt from "@/components/today/VisitorStayPrompt";
import WorthALook from "@/components/today/WorthALook";
import FromYourSaved from "@/components/today/FromYourSaved";
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
import { isEventToday } from "@/lib/eventWhenLabel";
import CravingStrip from "@/components/now/CravingStrip";
import FreshnessGuard from "@/components/today/FreshnessGuard";

/**
 * Now — the daily briefing.
 *
 * Spine (post-findability pass, top to bottom — matches the render below):
 *
 *   1. SkyHero        → time-of-day sky + date/clock + tonight teaser
 *   2. TodayContext   → slim salutation + golden-hour cue (self-hides)
 *   3. CravingStrip   → "I want…" bar (LocationPrime consent pill on its
 *                        right) + cravings grid + a "Getting around" row
 *   4. TodaysDeals    → verified day-of-week specials as a Wallet deck (self-hides)
 *   5. CivicAlerts    → worst-first heads-up (self-hides)
 *   6. What's on      → every public event in the city/county TODAY (no toggle)
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

/** Pick the next photo-backed marquee event for the hero card.
 *  Photo-led entries (Alive @ Five, Sky Stage) outrank text-only
 *  rows so the feature card always has imagery to carry — AND
 *  exclude administrative/private-sounding rows (board meetings,
 *  rehearsal dinners, prenatal classes) so the hero never carries
 *  a clinical entry.
 *
 *  Window-bounded to the next 72 hours. The old version had no upper
 *  bound, which is how an event two months out kept landing as the
 *  /today hero — a page that promises "today" shouldn't lead with
 *  something the user can't physically attend for weeks. If nothing
 *  photo-backed AND non-administrative is happening in the next 3
 *  days, we'd rather show no hero than lie about freshness. */
const FEATURED_EVENT_WINDOW_HOURS = 72;
function pickFeaturedEvent(now: Date, pool: EventWithMeta[]) {
  const windowEnd = now.getTime() + FEATURED_EVENT_WINDOW_HOURS * 3_600_000;
  // `pool` is the unified public set (curated + live feeds), already
  // venue-thumb-decorated and isPublicEvent-filtered by the shared
  // loader. The NON_PUBLIC_EVENT regex stays as belt-and-braces.
  const upcoming = pool.filter(
    (e) =>
      !NON_PUBLIC_EVENT.test(e.title ?? "") &&
      Date.parse(e.starts_at) <= windowEnd,
  );
  // Lead-rank, not raw chronology: a photo-led draw, then any real draw, then a
  // routine recurring program (storytime/class) last — so the cron-ingested
  // library calendar (PR #894) can't put a 10am storytime in the hero ahead of
  // tonight's carnival or concert.
  return pickLeadEvent(upcoming);
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

  // ONE unified public event set — the same shared loader /events
  // renders from, so "This weekend · N" can never disagree between the
  // two pages again (June-9 deep audit P0-5: /today said 1, /events said
  // 13, because /today counted curated seeds only).
  const { publicEvents } = await assembleUnifiedEvents(now);
  const featuredEvent = pickFeaturedEvent(now, publicEvents);

  // The golden-hour beat: an outdoor draw you can still catch in today's
  // remaining daylight, paired with the live light window in TodayContext.
  // Both halves are found facts (real sun math + a real event start).
  const goldenEvent = pickGoldenHourOutdoorEvent(publicEvents, now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);

  // Live music on stage TONIGHT — the wedge answer (who's playing, not where
  // the stages are). Feeds the contextual "right now" band above the I-want
  // grid; self-hides when nothing's on. The soonest show rides as a quiet
  // sub-label ("7:00 PM · Olde Mother"), never a count headline.
  const liveTonight = liveMusicTonight(publicEvents, now);
  const soonestShow = liveTonight[0];
  // The soonest show, as structured parts so the band can say WHAT it is (act +
  // venue + time), not just a time. RightNowBand owns the formatting + truncation.
  const soonest = soonestShow
    ? {
        title: soonestShow.title,
        venue: soonestShow.venue_name ?? null,
        time: eventDateBlock(soonestShow).time,
      }
    : undefined;
  // What's on = every PUBLIC event happening in the city or county TODAY,
  // soonest first. No time-mode toggle, no tomorrow/weekend — just today's
  // events, nothing else. The unified set already spans city + county; the
  // utility filter keeps council-hearing-type admin rows out of the headline.
  // EVERYTHING happening in the city or county TODAY, soonest first — no cap,
  // nothing dropped. The draws (concerts, markets, shows) lead as cards; the
  // civic/utility business (meetings, hearings) still shows, just as a quiet
  // "Also today" list so it's present without burying the draws.
  const todayAll = publicEvents
    .filter((e) => isEventToday(e.starts_at, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  // Draws lead, routine recurring programs (storytimes/classes) sink to the end
  // of the rail — soonest-first within each tier (compareForLead). The civic
  // tail stays chronological.
  const todaysEvents = todayAll.filter((e) => !isUtilityEvent(e)).sort(compareForLead);
  const todaysCivic = todayAll.filter((e) => isUtilityEvent(e));
  // Lead with the big feature card only when the featured event is one of today's.
  const showHero = Boolean(featuredEvent && todaysEvents.some((e) => e.slug === featuredEvent.slug));
  const upcomingRest = showHero
    ? todaysEvents.filter((e) => e.slug !== featuredEvent!.slug)
    : todaysEvents;

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
      <SkyHero className="shader-rim relative z-10">
        <Suspense fallback={<Skeleton.Block height={150} round="var(--app-radius-md)" />}>
          <TodayCard
            tonightEvent={
              // Today-only: the hero teaser shows tonight's event, never
              // tomorrow's — /today is the next 24 hours, so a "Tomorrow: …"
              // line has no place in the masthead.
              featuredEvent && isEventToday(featuredEvent.starts_at, now)
                ? {
                    slug: featuredEvent.slug,
                    title: featuredEvent.title,
                    venue_name: featuredEvent.venue_name ?? null,
                    starts_at: featuredEvent.starts_at,
                  }
                : null
            }
          />
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
        <p className="display-3" style={{ color: "var(--app-ink)" }}>
          Your field guide to Frederick County.
        </p>
        <p className="mt-1 text-body text-pretty" style={{ color: "var(--app-ink-2)" }}>
          From Downtown to the surrounding towns: food, events, parks, shops, and the places worth your time, right now.
        </p>
        <div className="mt-2 space-y-1.5">
          <HolidayNote now={now} />
          <TodayContext goldenEvent={goldenEvent} />
        </div>
        <div className="fg-rule mt-3" aria-hidden />
      </header>

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
      <div className="mt-4">
        <CravingStrip
          locationSlot={<LocationPrime />}
          contextSlot={
            <RightNowBand
              liveTonight={{ count: liveTonight.length, soonest }}
            />
          }
        />
      </div>

      {/* ── WHAT'S ON — every public event in the city or county TODAY. Moved
          ABOVE the moat (owner call): the day's events are the headline answer.
          Soonest first; the rest of the calendar is one tap away via "See all". */}
      <section className="mt-6 space-y-3" aria-label="What's on">
        <DismissibleSection
          id="upcoming"
          title="Today"
          href="/events"
          cta="See all"
          eyebrow="What's on"
          plateNo="Pl. I"
        >
          {showHero || upcomingRest.length > 0 || todaysCivic.length > 0 ? (
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
            </div>
          ) : (
            <p
              className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-[13px]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
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

      {/* ── HAPPY HOURS ON NOW — the most time-live "go now" signal off the
          Field Notes moat, as a wallet of overlapping "Last Pour" cards (the
          deal hook welded to the venue in gold); self-hides when none are
          in-window. */}
      <div className="mt-4">
        <HappyHourWallet now={now} />
      </div>

      {/* ── TODAY'S DEALS — the verified, day-of-week-aware specials running
          today, from the Field Notes moat. The 4pm "what's worth going out
          for" answer; self-hides when nothing runs today. */}
      <div className="mt-3">
        <TodaysDeals now={now} />
      </div>

      {/* "What's happening around you" (NearbyNow) was removed from /today
          (owner call): the craving grid + Today's Deals already answer "near
          me now," and the around-you geo surface duplicated that. It still
          lives on the map. */}

      {/* ── HEADS UP — high-signal interruption layer, only if needed ────
          "Before you make a plan, is there anything you need to know?"
          Self-hides when nothing is active; shows ONE worst-first alert
          (real, sourced, time-bound NWS/NPS), with a quiet "+N more →" to
          /pulse. Sits after Ask, before the best move — never a banner
          wall. See CivicAlerts. */}
      <Suspense fallback={null}>
        <div className="mt-4">
          <CivicAlerts />
        </div>
      </Suspense>

      {/* The generated "best move now" card (TodayMoves) was removed
          2026-06-18: /today is a place to FIND, not a suggestion engine. A
          rule-based "here's the move" tells the user an idea they may already
          have; the fast-lane I-want grid, the live moat (happy hours/deals),
          tonight's event in the hero, and What's-on below already let them
          find their own answer. Finding, not telling. */}

      {/* ── FROM YOUR SAVED ──────────────────────────────────────────────
          The save → resurface loop closes HERE: saved places that are
          open right now, offered back where the day starts. A client
          section (saves are client state) that renders nothing unless it
          has an answer — no saves or none open means no box. */}
      <FromYourSaved />

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
        href="/pulse#weather"
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

      {/* Visitor "Stay" door — self-hides for Residents. Kept inline
          (only shows for visitors, so it's not clutter for locals). */}
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
