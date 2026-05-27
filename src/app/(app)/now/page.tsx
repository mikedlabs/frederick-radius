import type { Metadata } from "next";
import { Suspense } from "react";
import WeatherHero from "@/components/today/WeatherHero";
import PrimaryActionCard from "@/components/today/PrimaryActionCard";
import SkyHero from "@/components/today/SkyHero";
import AdaptiveGreeting from "@/components/today/AdaptiveGreeting";
import CivicAlerts from "@/components/today/CivicAlerts";
import MoodTiles from "@/components/today/MoodTiles";
import RightNowStrip from "@/components/now/RightNowStrip";
import DismissibleSection from "@/components/today/DismissibleSection";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";
import Skeleton from "@/components/ui/Skeleton";
import TimeToggle, { isTodayTimeMode, type TodayTimeMode } from "@/components/today/TimeToggle";
import AlmanacFooter from "@/components/today/AlmanacFooter";
import HourlyForecast from "@/components/today/HourlyForecast";
import WeeklyForecast from "@/components/today/WeeklyForecast";
import ForecastCard from "@/components/today/ForecastCard";
import ForecastSummary from "@/components/today/ForecastSummary";

import { allUpcoming, eventsLive } from "@/lib/loaders/events";
import { easternWallToUtcISO } from "@/lib/tz";

/**
 * Now — the daily briefing.
 *
 * Strict 5-section spine (down from 7 in the previous pass, 11 before
 * that). Every section answers a question; nothing decorative.
 *
 *   1. Hero          → greeting + sun + civic alert + weather + plan
 *   2. MoodTiles     → "in the mood for" 4-up affordance row
 *   3. When?         → temporal toggle: Now / Tonight / Tomorrow / Weekend
 *   4. Upcoming      → featured event hero + the queue (mode-scoped)
 *   5. Worth tonight → one editorial place card (kept under review;
 *                      retires if RightNowStrip covers it)
 *
 * What got cut in this push:
 *   • LocalNewsStrip   — news belongs on its own surface, not the briefing
 *   • RightNow         — time-aware places overlap MoodTiles and the
 *                        upcoming events shelf
 *   • HistoryPulse     — editorial filler; one rotating fact ≠ daily utility
 *   • FromAboveTile    — the photography book has its own home
 *   • HiddenSectionsBar — managing hidden sections is a feature for a page
 *                        that has too many; a page with 5 sections doesn't
 *   • The /discover crosslink + "More around Frederick" divider
 *   • Hidden Frederick footer doors
 *
 * What got cut in prior passes (preserved here for archeology):
 *   • StatStrip "Across Frederick County"  — generic counts, no signal
 *   • PhotoMosaic "Looks like Frederick"   — pretty but redundant
 *   • RedditPulse                          — noisy subreddit posts
 *   • MunicipalityStrip                    — towns reachable via /m
 *   • DecorativeDivider variants           — visual filler
 *
 * Push 2 will replace the FeaturedTonightPicker with a proper
 * RightNowStrip — three direct answers (open now / starting soon /
 * weekend bet). At that point the editorial picker block retires too.
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
  const upcoming = allUpcoming(now).filter(
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
    return { title: "Happening now", items: [...eventsLive(now), ...inNext90] };
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
    items: allUpcoming(now).filter((e) => {
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
  return (
    <div className="relative space-y-6">
      <PageBloom />

      {/* 1 — Sky-tinted hero. Greeting + sun countdown + civic alert
          (when active) + weather (now and the 7-day, on one card) +
          plan card, layered on the time-of-day gradient. CivicAlerts
          lives INSIDE SkyHero so an active alert reads as part of the
          hero unit, not as a strange floating banner between the page
          header and the sky gradient. */}
      <SkyHero className="space-y-4">
        <Suspense fallback={<Skeleton.Block height={56} round="var(--app-radius-md)" />}>
          <AdaptiveGreeting />
        </Suspense>
        <Suspense fallback={null}>
          <CivicAlerts />
        </Suspense>
        <Suspense
          fallback={<Skeleton.Block height={180} round="var(--app-radius-lg)" />}
        >
          <WeatherHero />
        </Suspense>
        <PrimaryActionCard now={now} />
      </SkyHero>

      {/* Forecast disclosure — closed by default, remembers the user's
          choice across visits via localStorage. The peek summary
          ("7 days · 60° to 84° · 2 days of rain") is computed once
          server-side. Expanding reveals the iOS-style hourly rail +
          range-bar 7-day. /now stays compact unless the reader asks
          for the data. */}
      <ForecastCard
        summary={
          <Suspense fallback={<>Loading forecast…</>}>
            <ForecastSummary />
          </Suspense>
        }
      >
        <Suspense fallback={<Skeleton.Block height={92} round="var(--app-radius-md)" />}>
          <HourlyForecast />
        </Suspense>
        <Suspense fallback={<Skeleton.Block height={260} round="var(--app-radius-md)" />}>
          <WeeklyForecast />
        </Suspense>
      </ForecastCard>

      {/* RightNowStrip: three direct answers to the questions a
       *  stranger opens the app to ask: what's open near me, what's
       *  starting soon, what's worth this weekend. Each card is a
       *  full-width tap target into the canonical detail page.
       *
       *  Wrapped in Suspense so PPR streams the static shell of the
       *  page (hero, MoodTiles, time toggle) immediately while the
       *  ranked picks resolve from the cached helpers in src/lib/
       *  now-picks.ts. */}
      <Suspense
        fallback={
          <div className="space-y-2" aria-busy="true">
            <Skeleton.Block height={20} round="var(--app-radius-sm)" />
            <Skeleton.Block height={96} round="var(--app-radius-md)" />
            <Skeleton.Block height={96} round="var(--app-radius-md)" />
            <Skeleton.Block height={96} round="var(--app-radius-md)" />
          </div>
        }
      >
        <RightNowStrip now={now} />
      </Suspense>

      {/* In the mood for — 4-up affordance tiles (Coffee / Outdoors /
       *  Eat / With kids) that deep-link into the category page with
       *  the right scope. */}
      <MoodTiles />

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
            <a href="/now?t=weekend" className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
              See the weekend
            </a>
            .
          </p>
        )}
      </DismissibleSection>

      {/* A quiet last line at the bottom of the daily briefing. The
          sunrise / sunset clocks anchor the page in actual time-of-
          day, and the daylight delta vs yesterday is the part that
          reads as editorial — a casual scroll past it still picks
          up on "days are getting longer / shorter" without needing
          a label. */}
      <AlmanacFooter />
    </div>
  );
}
