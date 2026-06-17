import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import TodayCard from "@/components/today/TodayCard";
import TodayMoves from "@/components/today/TodayMoves";
import TodaysDeals from "@/components/today/TodaysDeals";
import HappyHourNow from "@/components/today/HappyHourNow";
import SkyHero, { currentSkyPalette } from "@/components/today/SkyHero";
import TodayContext from "@/components/today/TodayContext";
import LocationPrime from "@/components/today/LocationPrime";
// AdaptiveGreeting (serif headline like "Sun for now") was removed
// from the SkyHero pre-launch. The slimmer DateLine + NowDayStrip
// header above the hero now carries the temporal anchor — weekday +
// time + week strip — without a second editorial verdict on top of
// the WeatherHero's own conditions line. AdaptiveGreeting still
// lives at src/components/today/AdaptiveGreeting.tsx if we want to
// surface it elsewhere later.
import CivicAlerts from "@/components/today/CivicAlerts";
import DismissibleSection from "@/components/today/DismissibleSection";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import Skeleton from "@/components/ui/Skeleton";
import TimeToggle, { isTodayTimeMode, type TodayTimeMode } from "@/components/today/TimeToggle";
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
import PartnerAppsRow from "@/components/today/PartnerAppsRow";
// CreekHairline removed in the pleasant-layout pass — it was a
// decorative divider between weather/discovery and action; the
// reorder makes the divider unnecessary.

import { eventsLive, type EventWithMeta } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isUtilityEvent } from "@/lib/event-kind";
import { isEventToday } from "@/lib/eventWhenLabel";
import { easternWallToUtcISO } from "@/lib/tz";
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
 *   6. TodayMoves     → the single confident "best move now"
 *   7. What's on      → TimeToggle Now/Tonight/Tomorrow/Weekend + event tiles
 *   8. The full briefing + More for today (collapsed)
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
  return (
    upcoming.find((e) => Boolean(e.hero_image)) ??
    upcoming[0] ??
    null
  );
}

/**
 * Eastern-time calendar parts of an instant. The whole app's clock is
 * America/New_York; building windows with server-local Date.setHours
 * was the bug behind "tonight is 1pm" — on a UTC server setHours(16)
 * is 16:00Z, which is ~noon Eastern, so afternoon events leaked into
 * the Tonight slice.
 */
function easternParts(d: Date): { year: number; month: number; day: number; hour: number; weekday: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    weekday: WD[p.weekday as string] ?? 0,
  };
}

/** A UTC ISO `offsetDays` from `base`, at the given Eastern wall time. */
function easternDayAt(base: { year: number; month: number; day: number }, offsetDays: number, hour: number, minute = 0): string {
  // Walk the calendar day by constructing a UTC date and re-reading
  // it — avoids month/year rollover math.
  const walked = new Date(Date.UTC(base.year, base.month - 1, base.day + offsetDays, 12));
  return easternWallToUtcISO(
    walked.getUTCFullYear(),
    walked.getUTCMonth() + 1,
    walked.getUTCDate(),
    hour,
    minute,
  );
}

// Resolve a temporal mode to a per-mode event window. Each mode has
// its own headline so the Upcoming section reads as the answer to a
// specific question, not as a generic feed. All boundaries are
// computed in America/New_York so a UTC production server agrees with
// a Frederick user about what "tonight" means.
function eventsForMode(mode: TodayTimeMode, now: Date, pool: EventWithMeta[]) {
  const nowMs = now.getTime();
  const et = easternParts(now);

  if (mode === "now") {
    // Live right now OR starting in the next 90 minutes — from the SAME
    // unified pool /events renders (curated + live feeds). eventsLive(now)
    // stays in the union for its curated all-day handling; slug-dedupe
    // collapses the overlap.
    const inProgress = pool.filter((e) => {
      const s = Date.parse(e.starts_at);
      const en = e.ends_at ? Date.parse(e.ends_at) : NaN;
      return s <= nowMs && Number.isFinite(en) && nowMs <= en;
    });
    const inNext90 = pool.filter((e) => {
      const ms = new Date(e.starts_at).getTime() - nowMs;
      return ms >= 0 && ms <= 90 * 60_000;
    });
    const seen = new Set<string>();
    // Same draw/utility rule as /events (lib/event-kind): a council
    // hearing is never a "what's happening now" headline answer here.
    return {
      title: "Happening now",
      items: [...eventsLive(now), ...inProgress, ...inNext90].filter(
        (e) => !isUtilityEvent(e) && (seen.has(e.slug) ? false : (seen.add(e.slug), true)),
      ),
    };
  }

  let title: string;
  let startMs: number;
  let endMs: number;
  if (mode === "tonight") {
    // Eastern: today 17:00 → tomorrow 02:30. Clamped to now so a
    // late-night visit doesn't list events that already started.
    //
    // Bumped from 16:00 to 17:00 in the stranger-clarity pass: a 4:15
    // PM matinee is technically "tonight" by clock, but a user who
    // taps "Tonight" at 4:05 PM expects evening plans, not late
    // afternoon — the chip should match the intent, not the clock.
    title = "Tonight";
    startMs = Math.max(nowMs, Date.parse(easternDayAt(et, 0, 17, 0)));
    endMs = Date.parse(easternDayAt(et, 1, 2, 30));
  } else if (mode === "tomorrow") {
    // Eastern: the whole of tomorrow, 00:00 → 23:59.
    title = "Tomorrow";
    startMs = Date.parse(easternDayAt(et, 1, 0, 0));
    endMs = Date.parse(easternDayAt(et, 2, 0, 0)) - 1;
  } else {
    // Weekend: upcoming Fri 17:00 → Mon 00:00, all Eastern. If today
    // already is the weekend, the window is the current one.
    title = "This weekend";
    const daysToFri = (5 - et.weekday + 7) % 7;
    startMs = Date.parse(easternDayAt(et, daysToFri, 17, 0));
    endMs = Date.parse(easternDayAt(et, daysToFri + 3, 0, 0));
  }
  return {
    title,
    // The pool is already venue-thumb-decorated by the shared loader.
    items: pool.filter((e) => {
      const ms = Date.parse(e.starts_at);
      // Time window AND draw-only: utility/civic business is reachable on
      // /events, not surfaced as a Today answer (shared event-kind rule).
      return Number.isFinite(ms) && ms >= startMs && ms <= endMs && !isUtilityEvent(e);
    }),
  };
}

// /today is time-sensitive, but force-dynamic made every visit pay the
// external-feed fanout (a ~7-10s cold load — the sims caught it). Instead:
// ISR every 5 minutes, so the page serves cached + fast while the event
// groupings stay fresh-enough, and the *visible* clock + date are handled
// live, client-side, by <DateLine/>. (The original bug was pure-static
// with NO revalidate — a frozen build-time date; a short revalidate plus
// the live client clock fixes that without the per-request cost.)
export const revalidate = 300;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const now = new Date();

  // ONE unified public event set — the same shared loader /events
  // renders from, so "This weekend · N" can never disagree between the
  // two pages again (June-9 deep audit P0-5: /today said 1, /events said
  // 13, because /today counted curated seeds only).
  const { publicEvents } = await assembleUnifiedEvents(now);
  const featuredEvent = pickFeaturedEvent(now, publicEvents);
  // Pre-compute per-mode counts so the chip strip shows "Tonight · 3"
  // without forcing a click into an empty surface — AND so the default
  // mode picker below can land on a window that actually has events.
  const counts: Partial<Record<TodayTimeMode, number>> = {};
  for (const m of ["now", "tonight", "tomorrow", "weekend"] as const) {
    counts[m] = eventsForMode(m, now, publicEvents).items.length;
  }
  // Default mode: previously hard-wired to "now" which is empty most
  // of the day. Now we pick the first populated window in priority
  // order Now → Tonight → Tomorrow → Weekend. The user can still tap
  // any chip; this just stops the page from opening on an empty list
  // when something is happening one chip over.
  function pickDefaultMode(): TodayTimeMode {
    if ((counts.now ?? 0) > 0) return "now";
    if ((counts.tonight ?? 0) > 0) return "tonight";
    if ((counts.tomorrow ?? 0) > 0) return "tomorrow";
    return "weekend";
  }
  const mode: TodayTimeMode = isTodayTimeMode(t) ? t : pickDefaultMode();
  // Per-mode event window — title + items both come from one helper
  // so chip and rendered section never disagree.
  const slice = eventsForMode(mode, now, publicEvents);
  // Filter out the featured event so it doesn't appear twice in the
  // shelf below the hero. Only show the featured hero when the active
  // slice actually contains it.
  const sliceItems = slice.items.slice(0, 7);
  // Only LEAD with the big feature card when the featured event is actually
  // TODAY / tonight — /today must never headline a big card for a tomorrow
  // (or later) event. Otherwise the lead event just rides along as a tile.
  const showHero = Boolean(
    featuredEvent &&
      sliceItems.some((e) => e.slug === featuredEvent.slug) &&
      isEventToday(featuredEvent.starts_at, now),
  );
  const upcomingRest = showHero
    ? sliceItems.filter((e) => e.slug !== featuredEvent!.slug)
    : sliceItems;

  // When the active slice is empty, nudge to a DIFFERENT slice that
  // actually has events — never back to the same (empty) one, which is
  // what the old hardcoded "see the weekend" link did when Weekend
  // itself was empty. Falls back to the full /events page if nothing is
  // on the calendar in any near-term slice.
  const SLICE_LABEL: Record<TodayTimeMode, string> = {
    now: "happening now",
    tonight: "tonight",
    tomorrow: "tomorrow",
    weekend: "this weekend",
  };
  // Only suggest the OTHER today window (now/tonight) when the active one is
  // empty — tomorrow/weekend are off /today now, so anything beyond points to
  // the full /events browser instead.
  const fallbackSlice = (["now", "tonight"] as const).find(
    (m) => m !== mode && (counts[m] ?? 0) > 0,
  );

  return (
    <div className="relative">
      {/* Document-outline anchor. The visible "Sunday June 14" DateLine is an
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
          tonight's event LEADS the page (owner call: it's the most beautiful,
          most-glanceable opener). Moved up from the collapsed "full briefing";
          the detailed hourly / 7-day / almanac forecast still lives there.
          SkyHero's own -mx-4 -mt-4 bleeds it flush under the header for a
          full-bleed sky; the soft downward shadow floats it over the page. */}
      <SkyHero className="relative z-10 shadow-[0_12px_28px_-16px_rgba(22,20,14,0.22)]">
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

      {/* Salutation + golden-hour cue. The date / day / time itself now lives
          in the SkyHero header above; this slim line carries only the
          contextual extras and self-hides when there's neither. */}
      <div className="mt-2.5">
        <TodayContext />
      </div>

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
        <CravingStrip locationSlot={<LocationPrime />} />
      </div>

      {/* ── HAPPY HOURS ON NOW — the most time-live "go now" signal off the
          Field Notes moat; self-hides when none are in-window. */}
      <div className="mt-4">
        <HappyHourNow now={now} />
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

      {/* ── BEST MOVE NOW ───────────────────────────────────────────────
          The single confident, weather- and time-aware answer to "what's
          the move right now?", lifted OUT of the collapsed briefing so it
          leads. (The generated "afternoon plan"/MoveStack that used to sit
          here was removed 2026-06-15: it picked stops by editorial score +
          proximity, NOT by being open, and ended by telling you to "check
          hours before you go" — the opposite of a today answer. TodayMoves'
          own sub-line already serves the "make an outing of it" instinct.) */}
      <section className="mt-4" aria-label="Your next move">
        <Suspense fallback={<Skeleton.Block height={170} round="var(--app-radius-lg)" />}>
          <TodayMoves
            tonightEvent={
              featuredEvent
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
      </section>

      {/* ── FROM YOUR SAVED ──────────────────────────────────────────────
          The save → resurface loop closes HERE: saved places that are
          open right now, offered back where the day starts. A client
          section (saves are client state) that renders nothing unless it
          has an answer — no saves or none open means no box. */}
      <FromYourSaved />

      {/* ── WHAT'S ON (today / tonight / weekend) ────────────────────────
          Lifted OUT of the collapsed briefing's column to a TOP-LEVEL slot,
          right after the best move. Events are the heart of "what should I
          do today?", so they're a guided answer here — not buried under the
          weather. The When? toggle drives the window; the full weather stack
          and the rest stay collapsed below. */}
      <section className="mt-4 space-y-3" aria-label="What's on">
        <TimeToggle active={mode} counts={counts} />
        <DismissibleSection
          id="upcoming"
          title={slice.title}
          href="/events"
          cta="See all"
          eyebrow="What's on"
        >
          {showHero || upcomingRest.length > 0 ? (
            <div className="space-y-3">
              {showHero && featuredEvent && (
                <EventCard event={featuredEvent} variant="feature" />
              )}
              {upcomingRest.length > 0 && (
                <div className="-mx-4 px-4">
                  <div className="reveal-up shelf-rail gap-3 pb-1">
                    {upcomingRest.map((e) => (
                      <div key={`${e.slug}-${e.starts_at}`} className="w-[280px] shrink-0">
                        <EventCard event={e} variant="tile" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p
              className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-[13px]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              Nothing on the calendar for {slice.title.toLowerCase()}.{" "}
              {fallbackSlice ? (
                <Link href={`/today?t=${fallbackSlice}`} className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
                  See what&rsquo;s {SLICE_LABEL[fallbackSlice]}
                </Link>
              ) : (
                <Link href="/events" className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
                  Browse all events
                </Link>
              )}
              .
            </p>
          )}
        </DismissibleSection>
      </section>

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

      {/* DateLine + BriefingLine + NowDayStrip — the slim header
          that replaces the old AdaptiveGreeting block. Sits ABOVE
          SkyHero on the page background (paper-cream) so it reads
          as page metadata, not as a competing editorial line
          stacked on top of the weather. The BriefingLine answers
          "so what should I do?" in one sentence (rule-based
          synthesis of time-of-day, open places, and the next
          notable event) — the centerpiece of the data → decisions
          shift the review called for. */}
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
