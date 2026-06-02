import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import TodayCard from "@/components/today/TodayCard";
import TodayMoves from "@/components/today/TodayMoves";
import MoveStack from "@/components/today/MoveStack";
import SkyHero, { currentSkyPalette } from "@/components/today/SkyHero";
import DateLine from "@/components/today/DateLine";
import LocalNewsRail from "@/components/today/LocalNewsRail";
import NowDayStrip from "@/components/today/NowDayStrip";
// AdaptiveGreeting (serif headline like "Sun for now") was removed
// from the SkyHero pre-launch. The slimmer DateLine + NowDayStrip
// header above the hero now carries the temporal anchor — weekday +
// time + week strip — without a second editorial verdict on top of
// the WeatherHero's own conditions line. AdaptiveGreeting still
// lives at src/components/today/AdaptiveGreeting.tsx if we want to
// surface it elsewhere later.
import CivicAlerts from "@/components/today/CivicAlerts";
import MoodTiles from "@/components/today/MoodTiles";
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
import WeatherMore from "@/components/today/WeatherMore";
import WeatherMoreGrid from "@/components/today/WeatherMoreGrid";
import BetaIntroCard from "@/components/today/BetaIntroCard";
import VisitorStayPrompt from "@/components/today/VisitorStayPrompt";
import WorthALook from "@/components/today/WorthALook";
import FromAboveCta from "@/components/today/FromAboveCta";
import PartnerAppsRow from "@/components/today/PartnerAppsRow";
// CreekHairline removed in the pleasant-layout pass — it was a
// decorative divider between weather/discovery and action; the
// reorder makes the divider unnecessary.

import { allUpcoming, eventsLive } from "@/lib/loaders/events";
import { getOpenNowCount, findBucket } from "@/lib/find-picks";
import { isUtilityEvent } from "@/lib/event-kind";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { easternWallToUtcISO } from "@/lib/tz";
import TodayAsk from "@/components/today/TodayAsk";
import { AnswerCard } from "@/components/answer";
import { buildTodayAnswers } from "@/lib/answers/defaultTodayAnswers";
import { PARKING_GARAGES } from "@/data/parking-garages";

/**
 * Now — the daily briefing.
 *
 * Spine (post-cleanup pass):
 *
 *   1. Hero          → DateLine + day strip + SkyHero + weather panel
 *   2. MoodTiles     → "in the mood for" 6-up affordance row
 *   3. PartnerApps   → ParkMobile + OpenTable handoffs
 *   4. WorthALook    → one editorial place card
 *   5. When?         → temporal toggle: Now / Tonight / Tomorrow / Weekend
 *   6. Upcoming      → featured event hero + the queue (mode-scoped)
 *   7. From Above    → quiet exit beat → photography book
 *
 * What got cut in this pass:
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
  description: "What's open, what's happening, and what's worth your time in Frederick County right now.",
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
function pickFeaturedEvent(now: Date) {
  const windowEnd = now.getTime() + FEATURED_EVENT_WINDOW_HOURS * 3_600_000;
  // withVenueThumbs borrows each event's venue photo onto hero_image
  // when the event has no image of its own. Without this, Alive @ Five
  // (and any other DFP event without a hardcoded photo) lost out to
  // the "must have hero_image" check below and missed the photo path
  // /events shows. Cheap on a small list — just a slug lookup per event.
  const upcoming = withVenueThumbs(allUpcoming(now)).filter(
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
function eventsForMode(mode: TodayTimeMode, now: Date) {
  const nowMs = now.getTime();
  const et = easternParts(now);

  if (mode === "now") {
    // Live right now OR starting in the next 90 minutes.
    const inNext90 = allUpcoming(now).filter((e) => {
      const ms = new Date(e.starts_at).getTime() - nowMs;
      return ms >= 0 && ms <= 90 * 60_000;
    });
    // Same draw/utility rule as /events (lib/event-kind): a council
    // hearing is never a "what's happening now" headline answer here.
    return {
      title: "Happening now",
      items: [...eventsLive(now), ...inNext90].filter((e) => !isUtilityEvent(e)),
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
    // withVenueThumbs again here — the Upcoming shelf cards need the
    // venue photo too, otherwise an Alive @ Five tile sits as a
    // text-only card next to events that DO carry a hero image.
    items: withVenueThumbs(allUpcoming(now)).filter((e) => {
      const ms = Date.parse(e.starts_at);
      // Time window AND draw-only: utility/civic business is reachable on
      // /events, not surfaced as a Today answer (shared event-kind rule).
      return Number.isFinite(ms) && ms >= startMs && ms <= endMs && !isUtilityEvent(e);
    }),
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const now = new Date();

  const featuredEvent = pickFeaturedEvent(now);
  // Pre-compute per-mode counts so the chip strip shows "Tonight · 3"
  // without forcing a click into an empty surface — AND so the default
  // mode picker below can land on a window that actually has events.
  const counts: Partial<Record<TodayTimeMode, number>> = {};
  for (const m of ["now", "tonight", "tomorrow", "weekend"] as const) {
    counts[m] = eventsForMode(m, now).items.length;
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
  const slice = eventsForMode(mode, now);
  // Filter out the featured event so it doesn't appear twice in the
  // shelf below the hero. Only show the featured hero when the active
  // slice actually contains it.
  const sliceItems = slice.items.slice(0, 7);
  const heroInSlice =
    featuredEvent && sliceItems.some((e) => e.slug === featuredEvent.slug);
  const upcomingRest = heroInSlice
    ? sliceItems.filter((e) => e.slug !== featuredEvent!.slug)
    : sliceItems;

  // Live counts for the two doors. Both cached (10-min / hourly buckets)
  // so the home page reads them off the edge, never paying the rank cost.
  const openCount = await getOpenNowCount(findBucket(now));

  // ── Answer-first lead (UX_REDO Build 1): build 3 to 5 anticipatory
  //    answers from the real data this page already computed. Honest by
  //    construction — empty windows drop out, nothing is fabricated.
  const tonightBest = eventsForMode("tonight", now).items[0] ?? null;
  const weekendBest = eventsForMode("weekend", now).items[0] ?? null;
  const parkingDefault =
    PARKING_GARAGES.find((g) => g.slug === "carroll-creek-parking-garage-frederick") ??
    PARKING_GARAGES[0] ??
    null;
  const todayAnswers = buildTodayAnswers({
    openCount,
    tonightCount: counts.tonight ?? 0,
    tonightBest: tonightBest
      ? { title: tonightBest.title, venue: tonightBest.venue_name ?? null, slug: tonightBest.slug }
      : null,
    weekendCount: counts.weekend ?? 0,
    weekendBest: weekendBest
      ? { title: weekendBest.title, venue: weekendBest.venue_name ?? null, slug: weekendBest.slug }
      : null,
    parking: parkingDefault ? { name: parkingDefault.name, slug: parkingDefault.slug } : null,
  });

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
  const fallbackSlice = (["now", "tonight", "tomorrow", "weekend"] as const).find(
    (m) => m !== mode && (counts[m] ?? 0) > 0,
  );

  return (
    <div className="relative">
      <PageBloom />

      {/* First-visit beta intro — explains what Frederick Radius is,
          the current beta state, what's coming, and how to send
          feedback. Renders only when the dismiss cookie hasn't been
          set; once dismissed, never shows again until we ship a v2
          message and bump the key. Client component so the SSR HTML
          is empty and there's no hydration flash. Full-width above
          the desktop split so it spans both columns. */}
      <div className="space-y-4">
        <BetaIntroCard />
        {/* DateLine + BriefingLine lifted to full width above the
            desktop split so the orientation + "what should I do?"
            answer always leads — on mobile the weather column now
            drops BELOW the action stack (see the order- classes on
            the split children), so the page opens with the answer
            instead of a stack of weather modules. */}
        <div className="space-y-2">
          <DateLine />
        </div>
      </div>

      {/* ── ANSWER-FIRST LEAD (UX_REDO Build 1) ─────────────────────────
          The ask + 3 to 5 anticipatory answer cards are the front door.
          Weather drops into the supporting split below. North Star:
          "Answer my question in one move. Don't make me dig." */}
      <section className="mt-4 space-y-3" aria-label="Ask Radius">
        <TodayAsk />
        {todayAnswers.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {todayAnswers.map((a) => (
              <AnswerCard key={a.id} answer={a} />
            ))}
          </div>
        )}
      </section>

      {/* RESPONSIVE SPLIT (desktop only):
       *   mobile  : everything stacks single-column (space-y-6).
       *   lg+     : two-column grid — LEFT carries the day/weather
       *             stack (the "what's it like outside" answer);
       *             RIGHT carries the action stack (mood tiles,
       *             partner apps, WorthALook, events, From Above).
       * Each column keeps its own internal space-y-6 spine so the
       * vertical rhythm doesn't collapse at the breakpoint. */}
      {/* THE FULL BRIEFING — weather, events, and the rest, COLLAPSED by
          default so the first screen is just the ask + the answers. Depth
          is one tap away, not the opening wall. Reversible: flip
          defaultOpen, or lift any module back above to taste. */}
      <CollapsibleSection title="The full briefing" storageKey="fr.today.briefing" defaultOpen={false}>
      <div className="mt-2 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-5">
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
      {/* 1 — Sky-tinted hero. Sun countdown + weather (now and the
          7-day, on one card) + plan card, layered on the time-of-day
          gradient. */}
      {/* WEATHER BLOCK — one cohesive unit. SkyHero + CivicAlerts
          (when active) + Hourly + 7-day + Almanac all sit in a tight
          `space-y-2` (8px) container so they read as a connected
          stack instead of four floating cards. The parent's
          space-y-6 only kicks back in BELOW this group, when
          MoodTiles and the rest of /now take over. */}
      {/* CivicAlerts placement: moved OUT of SkyHero (where it lived
          on the sky gradient and visually competed with the weather
          hero) to its own row between SkyHero and HourlyForecast.
          During a severe-weather event the red/orange alert banner
          now reads as a distinct row above the hourly forecast — the
          warning lands with the visual weight it needs, instead of
          getting absorbed into the sky gradient. When no alert is
          active CivicAlerts renders nothing and the stack collapses
          (Suspense fallback={null}). */}
      {/* WEATHER BLOCK — one cohesive unit. SkyHero is the visual hero;
          everything below (CivicAlerts when active, Hourly, More-details
          disclosure, 7-day disclosure, Almanac) lives in ONE bordered
          container with internal hairline dividers so the four sub-cards
          read as ONE weather panel instead of four floating cards. The
          gradient hero overlaps the panel's top edge by 8px so the two
          read as connected; the panel's own border holds the rest of
          the weather stack together. */}
      {/* Wallet-card stack: SkyHero (weather) sits ON TOP of the
          weather sub-card panel (hourly + weekly + more), like two
          physical cards laying on each other. The sub-card panel
          slides UP by -3 (12px) so its top edge tucks behind the
          SkyHero's rounded bottom; a soft downward shadow on the
          SkyHero casts depth onto the panel. Net visual: weather
          card floats, week + hourly + more peeks from underneath. */}
      <div className="relative">
        <SkyHero className="relative z-10 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.22)]">
          {/* TodayCard — the daily hook (P1): greeting + weather mood +
              now/high/sunset + tonight's event + two situational CTAs.
              Folds in the old BriefingLine's job and the compact weather
              readout into one editorial "why this exists" moment. */}
          <Suspense
            fallback={<Skeleton.Block height={150} round="var(--app-radius-md)" />}
          >
            <TodayCard
              tonightEvent={
                featuredEvent
                  ? {
                      slug: featuredEvent.slug,
                      title: featuredEvent.title,
                      venue_name: featuredEvent.venue_name ?? null,
                    }
                  : null
              }
            />
          </Suspense>
        </SkyHero>

        {/* Command center — the confident "what's the move?" answer lives
            on PAPER just below the sky hook: one weather-aware primary
            move + Tonight + Near you. Leads the page so the weather panel
            and the rest read as supporting detail, not the headline. */}
        <div className="mt-3">
          <Suspense fallback={<Skeleton.Block height={170} round="var(--app-radius-lg)" />}>
            <TodayMoves
              tonightCount={counts.tonight ?? 0}
              tonightEvent={
                featuredEvent
                  ? {
                      slug: featuredEvent.slug,
                      title: featuredEvent.title,
                      venue_name: featuredEvent.venue_name ?? null,
                    }
                  : null
              }
            />
          </Suspense>
        </div>

        {/* Move Stack — a confident "plan your next few hours" itinerary
            (dinner → drinks → music), ranked + weather/time-aware. The
            decision-engine payoff: one sequence, not a wall of options. */}
        <div className="mt-3">
          <Suspense fallback={<Skeleton.Block height={200} round="var(--app-radius-lg)" />}>
            <MoveStack />
          </Suspense>
        </div>

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
          <Suspense fallback={null}>
            <CivicAlerts />
          </Suspense>
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
          <WeatherMore>
            <Suspense fallback={<Skeleton.Block height={280} round="0" />}>
              <WeatherMoreGrid />
            </Suspense>
          </WeatherMore>
            </div>
            </div>
          );
        })()}
      </div>

      {/* NowDayStrip — the multi-day weather strip. Moved BELOW the
          cinematic sky fold (it used to sit above SkyHero and broke the
          "slim header → full-bleed sky" first screen). It now caps the
          weather column as a quick multi-day glance after the detailed
          panel. Async (NWS daily forecast → glyph + hi/lo per day);
          Suspense fallback matches the strip's height. */}
      <Suspense fallback={<Skeleton.Block height={86} round="var(--app-radius-sm)" />}>
        <NowDayStrip />
      </Suspense>

        </div>{/* /LEFT column */}

        {/* ── RIGHT column: the action stack. Follows the weather on
            mobile; second column at lg+. stagger-children makes the
            section assemble itself — each card breathes in just after
            the last, so the page feels alive on arrival. ──────────── */}
        <div className="space-y-4 stagger-children">

      {/* CLEANUP PASS (the answer leads, the rest collapses):
       *   1. When? toggle  2. Tonight/events (THE answer)
       *   3. MoodTiles (quick needs)
       *   4. "More for today" — everything secondary, collapsed by
       *      default (partner apps, worth-a-look, local news, from-above),
       *      so the page opens SHORT and scannable instead of a 13-section
       *      wall you scroll forever. */}

      {/* When? — temporal control for the events section directly below. */}
      <TimeToggle active={mode} counts={counts} />

      {/* ── THE ANSWER: what's happening, leads the action column. ── */}
      <DismissibleSection
        id="upcoming"
        title={slice.title}
        href="/events"
        cta="See all"
        eyebrow="What's on"
        plateNo="No. 01"
      >
        {heroInSlice || upcomingRest.length > 0 ? (
          <div className="space-y-3">
            {heroInSlice && featuredEvent && (
              <EventCard event={featuredEvent} variant="feature" />
            )}
            {upcomingRest.length > 0 && (
              <div className="-mx-4 px-4">
                <div className="reveal-up shelf-rail gap-3 pb-1">
                  {upcomingRest.map((e) => (
                    <div key={e.slug} className="w-[280px] shrink-0">
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
              <Link href={`/today?t=${fallbackSlice}`} className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
                See what&rsquo;s {SLICE_LABEL[fallbackSlice]}
              </Link>
            ) : (
              <Link href="/events" className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
                Browse all events
              </Link>
            )}
            .
          </p>
        )}
      </DismissibleSection>

      {/* MoodTiles — "what do you need right now" quick-needs row. */}
      <MoodTiles />

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
          <Suspense fallback={null}>
            <LocalNewsRail />
          </Suspense>
          <FromAboveCta />
        </div>
      </CollapsibleSection>

        </div>{/* /RIGHT column */}
      </div>{/* /responsive split */}
      </CollapsibleSection>
    </div>
  );
}
