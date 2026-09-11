import type { Metadata } from "next";
import { Suspense } from "react";
import WeatherHero from "@/components/today/WeatherHero";
import SkyHero, { currentSkyPalette } from "@/components/today/SkyHero";
import DateLine from "@/components/today/DateLine";
import BriefingLine from "@/components/today/BriefingLine";
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
import Skeleton from "@/components/ui/Skeleton";
import TimeToggle, { isTodayTimeMode, type TodayTimeMode } from "@/components/today/TimeToggle";
import AlmanacFooter from "@/components/today/AlmanacFooter";
import HourlyForecast from "@/components/today/HourlyForecast";
import HourlyDisclosure from "@/components/today/HourlyDisclosure";
import HourlySummary from "@/components/today/HourlySummary";
import WeeklyForecast from "@/components/today/WeeklyForecast";
import WeeklyCard from "@/components/today/WeeklyCard";
import WeeklySummary from "@/components/today/WeeklySummary";
import WeatherMore from "@/components/today/WeatherMore";
import WeatherMoreGrid from "@/components/today/WeatherMoreGrid";
import BetaIntroCard from "@/components/today/BetaIntroCard";
import WorthALook from "@/components/today/WorthALook";
import FromAboveCta from "@/components/today/FromAboveCta";
import PartnerAppsRow from "@/components/today/PartnerAppsRow";
// CreekHairline removed in the pleasant-layout pass — it was a
// decorative divider between weather/discovery and action; the
// reorder makes the divider unnecessary.

import { allUpcoming, eventsLive, dedupeLiveAgainstCurated, type EventWithMeta } from "@/lib/loaders/events";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { fetchTicketmasterMusic } from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { easternWallToUtcISO } from "@/lib/tz";

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
export const revalidate = 3600;

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
function pickFeaturedEvent(now: Date, allEvents: EventWithMeta[]) {
  const windowEnd = now.getTime() + FEATURED_EVENT_WINDOW_HOURS * 3_600_000;
  // withVenueThumbs borrows each event's venue photo onto hero_image
  // when the event has no image of its own. Without this, Alive @ Five
  // (and any other DFP event without a hardcoded photo) lost out to
  // the "must have hero_image" check below and missed the photo path
  // /events shows. Cheap on a small list — just a slug lookup per event.
  const upcoming = withVenueThumbs(allEvents).filter(
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
function eventsForMode(mode: TodayTimeMode, now: Date, allEvents: EventWithMeta[]) {
  const nowMs = now.getTime();
  const et = easternParts(now);

  if (mode === "now") {
    // Live right now OR starting in the next 90 minutes.
    const inNext90 = allEvents.filter((e) => {
      const ms = new Date(e.starts_at).getTime() - nowMs;
      return ms >= 0 && ms <= 90 * 60_000;
    });
    const happeningNow = allEvents.filter(e => new Date(e.starts_at).getTime() <= nowMs && new Date(e.ends_at).getTime() >= nowMs);
    // Deduplicate against inNext90 just in case
    const nowSlugs = new Set(happeningNow.map(e => e.slug));
    const next90Unique = inNext90.filter(e => !nowSlugs.has(e.slug));
    return { title: "Happening now", items: [...happeningNow, ...next90Unique] };
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
    items: withVenueThumbs(allEvents).filter((e) => {
      const ms = Date.parse(e.starts_at);
      return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
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

  // 1. Fetch live events
  const curatedUpcoming = allUpcoming(now);
  const [{ events: liveEventsRaw }, tmEvents, bitEvents] = await Promise.all([
    getLiveEvents(60),
    fetchTicketmasterMusic().catch(() => []),
    fetchBandsintownForArtists([]).catch(() => []),
  ]);

  // 2. Dedupe and merge
  const liveCards = dedupeLiveAgainstCurated(
    [...liveEventsRaw, ...tmEvents, ...bitEvents].map(liveToCardEvent),
    curatedUpcoming
  );
  const bySlug = new Map<string, EventWithMeta>();
  for (const e of [...curatedUpcoming, ...liveCards]) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, e);
  }
  const allMerged = [...bySlug.values()].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));

  const featuredEvent = pickFeaturedEvent(now, allMerged);
  // Pre-compute per-mode counts so the chip strip shows "Tonight · 3"
  // without forcing a click into an empty surface — AND so the default
  // mode picker below can land on a window that actually has events.
  const counts: Partial<Record<TodayTimeMode, number>> = {};
  for (const m of ["now", "tonight", "tomorrow", "weekend"] as const) {
    counts[m] = eventsForMode(m, now, allMerged).items.length;
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
  const slice = eventsForMode(mode, now, allMerged);
  // Filter out the featured event so it doesn't appear twice in the
  // shelf below the hero. Only show the featured hero when the active
  // slice actually contains it.
  const sliceItems = slice.items.slice(0, 7);
  const heroInSlice =
    featuredEvent && sliceItems.some((e) => e.slug === featuredEvent.slug);
  const upcomingRest = heroInSlice
    ? sliceItems.filter((e) => e.slug !== featuredEvent!.slug)
    : sliceItems;
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
      <div className="space-y-6">
        <BetaIntroCard />
      </div>

      {/* RESPONSIVE SPLIT (desktop only):
       *   mobile  : everything stacks single-column (space-y-6).
       *   lg+     : two-column grid — LEFT carries the day/weather
       *             stack (the "what's it like outside" answer);
       *             RIGHT carries the action stack (mood tiles,
       *             partner apps, WorthALook, events, From Above).
       * Each column keeps its own internal space-y-6 spine so the
       * vertical rhythm doesn't collapse at the breakpoint. */}
      <div className="mt-6 space-y-6 lg:mt-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        {/* ── LEFT column: the day + weather block ───────────── */}
        <div className="space-y-6">

      {/* DateLine + BriefingLine + NowDayStrip — the slim header
          that replaces the old AdaptiveGreeting block. Sits ABOVE
          SkyHero on the page background (paper-cream) so it reads
          as page metadata, not as a competing editorial line
          stacked on top of the weather. The BriefingLine answers
          "so what should I do?" in one sentence (rule-based
          synthesis of time-of-day, open places, and the next
          notable event) — the centerpiece of the data → decisions
          shift the review called for. */}
      <div className="space-y-2">
        <DateLine />
        <BriefingLine />
        {/* NowDayStrip became async (fetches NWS daily forecast to
            render a weather glyph + hi/lo per day). Suspense so the
            header above SkyHero doesn't block — fallback is a slim
            placeholder matching the day-strip's height. */}
        <Suspense fallback={<Skeleton.Block height={86} round="var(--app-radius-sm)" />}>
          <NowDayStrip />
        </Suspense>
      </div>

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
      <div>
        <SkyHero>
          <Suspense
            fallback={<Skeleton.Block height={180} round="var(--app-radius-lg)" />}
          >
            <WeatherHero />
          </Suspense>
          {/* AlmanacFooter moved INSIDE the SkyHero gradient as a
              quiet footer line under the weather hero. Used to live
              at the bottom of the consolidated weather panel; pulled
              up here so sunrise/sunset/daylight-delta/AQI/comfort
              read as part of the sky scene the user is looking at,
              not a separate strip you scroll past. Inherits the
              sky's currentColor for tone-aware ink. */}
          <Suspense fallback={null}>
            <AlmanacFooter inSky />
          </Suspense>
        </SkyHero>
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
            <div
              className="relative z-10 mt-2 overflow-hidden rounded-[var(--app-radius-lg)] border [&_>_*:not(:last-child)]:border-b"
              style={{
                borderColor: "var(--app-border)",
                boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                background: stackBg,
              }}
            >
          <Suspense fallback={null}>
            <CivicAlerts />
          </Suspense>
          {/* All three weather subsections (Hourly · 7-Day · More
              Details) are now disclosure pills for visual uniformity.
              Hourly defaults open (it's the most-glanced piece); the
              other two default closed. Each one carries a real
              summary so the collapsed pill reads as informative, not
              a "we hid stuff" placeholder. */}
          <HourlyDisclosure
            summary={
              <Suspense fallback={<>Loading…</>}>
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
              <Suspense fallback={<>Loading…</>}>
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
          );
        })()}
      </div>

        </div>{/* /LEFT column */}

        {/* ── RIGHT column: the action stack ─────────────────── */}
        <div className="space-y-6">

      {/* SPINE REORDER (cleanup pass):
       *
       *   weather (left, above on mobile) → MOOD → PARTNER APPS →
       *   DISCOVERY (WorthALook) → events → from above
       *
       * Earlier passes carried two more surfaces here —
       * RightNowStrip ("On deck") and PrimaryActionCard ("Plan
       * tonight"). Both were retired: the events section +
       * TimeToggle below already cover the "what's happening
       * tonight" job; the MoreSheet's Tools cluster carries Plan,
       * Within Reach, and Pulse. Keeping these on /now meant the
       * page repeated itself across three scroll-screens.
       *
       * On desktop, this column rides alongside the weather column
       * — both visible without scrolling. On mobile, it stacks
       * after the weather block.
       */}

      {/* MoodTiles — what do you need right now, with sub-tile expand. */}
      <MoodTiles />

      {/* PartnerAppsRow — ParkMobile + OpenTable. */}
      <PartnerAppsRow />

      {/* Worth a look today — the page's surprise-me block now lives
          AFTER the action surfaces, so it earns return visits without
          burying the actually-useful answers above it. */}
      <Suspense fallback={<Skeleton.Block height={250} round="var(--app-radius-lg)" />}>
        <WorthALook />
      </Suspense>

      {/* When? — the brand-defining temporal control. Pivots the
       *  events section between Now / Tonight / Tomorrow / Weekend.
       *  Mode lives in ?t= so the view is shareable. */}
      <TimeToggle active={mode} counts={counts} />

      {/* ── PRIMARY ZONE ───────────────────────────────────────────
          The two things a stranger opens the app to learn: what's the
          day like (the SkyHero above) and what's happening (this). The
          events section sits directly under the toggle so the answer
          to "what should I do?" is the first thing below the fold. */}
      <DismissibleSection
        id="upcoming"
        title={slice.title}
        href="/events"
        cta="See all"
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
          // Empty state — the section never silently vanishes when a
          // time slice has nothing. Quiet, with a nudge to a slice
          // that does have events.
          <p
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-[13px]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            Nothing on the calendar for {slice.title.toLowerCase()}.{" "}
            <a href="/today?t=weekend" className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
              See the weekend
            </a>
            .
          </p>
        )}
      </DismissibleSection>

      {/* Local news — RSS headlines from Patch / FNP / MD Matters
          via getLocalNews(). Headlines + attribution + relative
          timestamp; every card links OUT to the publisher. The
          server component self-hides when every source errored,
          so we never show a broken "Local news" section. */}
      <Suspense fallback={null}>
        <LocalNewsRail />
      </Suspense>

      {/* From Above — the page's quiet exit beat. After the daily
          utility surfaces (weather + events + places) finish their
          work, the user is invited into the photography book. The
          card carries a seasonal thumbnail from the same /images/
          seasons collection that backs /about's hero, so the visual
          identity stays consistent end-to-end. */}
      <FromAboveCta />

        </div>{/* /RIGHT column */}
      </div>{/* /responsive split */}
    </div>
  );
}
