import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Clock, Car, Train } from "lucide-react";
import TodayCard from "@/components/today/TodayCard";
import MoveStack from "@/components/today/MoveStack";
import SkyHero from "@/components/today/SkyHero";
import DateLine from "@/components/today/DateLine";
import ForecastLine from "@/components/today/ForecastLine";
import CivicAlerts from "@/components/today/CivicAlerts";
import DismissibleSection from "@/components/today/DismissibleSection";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";
import Skeleton from "@/components/ui/Skeleton";
import TimeToggle, { isTodayTimeMode, type TodayTimeMode } from "@/components/today/TimeToggle";
import WorthALook from "@/components/today/WorthALook";
import FromYourSaved from "@/components/today/FromYourSaved";
import FromAboveCta from "@/components/today/FromAboveCta";
import VisitorStayPrompt from "@/components/today/VisitorStayPrompt";
import CravingStrip from "@/components/now/CravingStrip";
import FreshnessGuard from "@/components/today/FreshnessGuard";

import { eventsLive, type EventWithMeta } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isUtilityEvent } from "@/lib/event-kind";
import { easternWallToUtcISO } from "@/lib/tz";

/**
 * Today — the daily answer, and the app's root (Session 1, Decision 1).
 *
 * The page is ONE canvas built around the time scrubber (handoff
 * pattern P1): the four-segment When? control (Now / Tonight / Tomorrow
 * / Weekend) swaps the event window in place of question marks, and the
 * per-segment counts read from the SAME arrays that render the lists, so
 * a count can never contradict its list.
 *
 * Spine (Session 2 subtraction):
 *   1. Canvas      → weekday heading + one weather sentence + readout (SkyHero/TodayCard)
 *                    and the compact forecast strip (NowDayStrip)
 *   2. Heads up    → conditional alert strip (CivicAlerts, self-hiding)
 *   3. Cravings    → category chips (the fast lane)
 *   4. Getting around → "What's open near you" + parking + transit, as links
 *   5. What's on   → the time scrubber: the event hero rendered ONCE + a tile shelf
 *   6. Worth a look → the one editorial pick module
 *   7. The plan    → the P4 horizontal snap deck (MoveStack → PlanDeck)
 *   8. Saved/visitor → conditional personal modules (self-hiding)
 *   9. Footer      → the drone-book promo, demoted (and free of the line budget)
 *
 * Deleted in the Session 2 subtraction (was the dashboard): the
 * "<N> places open" stat card, the full weather block (hourly / 7-day /
 * more-details disclosures), the duplicate event answer cards and the
 * TodayMoves module (the event hero now renders once, in the scrubber),
 * the ParkMobile/OpenTable explainer, the local-news rail, and the
 * first-visit beta strip. Depth that survives (parking, transit) is a
 * link, not a plate.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description: "What's open, what's happening, and what's worth your time in Frederick County right now.",
  openGraph: {
    title: "Today in Frederick County",
    description: "What's open, what's happening, and what's worth your time in Frederick County right now.",
  },
};

// Event titles that look like internal/admin business — board meetings,
// hearings, classes, rehearsals. Public meetings live on /events under
// their own section; they never carry a "what's on" hero card here.
const NON_PUBLIC_EVENT = /\b(board|council|commission|hearing|workshop|rehearsal|board meeting|training|orientation|class|certification|breastfeeding|prenatal|birthing|info session|hr|policy)\b/i;

/** Pick the next photo-backed marquee event for the hero card, bounded
 *  to the next 72 hours so a page that promises "today" never leads with
 *  something weeks out. Photo-led entries outrank text-only rows; admin
 *  rows are excluded. */
const FEATURED_EVENT_WINDOW_HOURS = 72;
function pickFeaturedEvent(now: Date, pool: EventWithMeta[]) {
  const windowEnd = now.getTime() + FEATURED_EVENT_WINDOW_HOURS * 3_600_000;
  const upcoming = pool.filter(
    (e) =>
      !NON_PUBLIC_EVENT.test(e.title ?? "") &&
      Date.parse(e.starts_at) <= windowEnd,
  );
  return upcoming.find((e) => Boolean(e.hero_image)) ?? upcoming[0] ?? null;
}

/**
 * Eastern-time calendar parts of an instant. The whole app's clock is
 * America/New_York; building windows with server-local Date.setHours
 * was the bug behind "tonight is 1pm" on a UTC server.
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
  const walked = new Date(Date.UTC(base.year, base.month - 1, base.day + offsetDays, 12));
  return easternWallToUtcISO(
    walked.getUTCFullYear(),
    walked.getUTCMonth() + 1,
    walked.getUTCDate(),
    hour,
    minute,
  );
}

// Resolve a temporal mode to a per-mode event window. Title + items both
// come from this one helper so the scrubber chip and the rendered list
// never disagree (the count-integrity invariant). All boundaries are
// America/New_York so a UTC server agrees with a Frederick user about
// what "tonight" means.
function eventsForMode(mode: TodayTimeMode, now: Date, pool: EventWithMeta[]) {
  const nowMs = now.getTime();
  const et = easternParts(now);

  if (mode === "now") {
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
    // Eastern: today 17:00 → tomorrow 02:30, clamped to now.
    title = "Tonight";
    startMs = Math.max(nowMs, Date.parse(easternDayAt(et, 0, 17, 0)));
    endMs = Date.parse(easternDayAt(et, 1, 2, 30));
  } else if (mode === "tomorrow") {
    title = "Tomorrow";
    startMs = Date.parse(easternDayAt(et, 1, 0, 0));
    endMs = Date.parse(easternDayAt(et, 2, 0, 0)) - 1;
  } else {
    title = "This weekend";
    const daysToFri = (5 - et.weekday + 7) % 7;
    startMs = Date.parse(easternDayAt(et, daysToFri, 17, 0));
    endMs = Date.parse(easternDayAt(et, daysToFri + 3, 0, 0));
  }
  return {
    title,
    items: pool.filter((e) => {
      const ms = Date.parse(e.starts_at);
      return Number.isFinite(ms) && ms >= startMs && ms <= endMs && !isUtilityEvent(e);
    }),
  };
}

// ISR every 5 minutes: the page serves cached + fast while the event
// groupings stay fresh-enough; the visible clock/date are live client-side
// (<DateLine/>). A short revalidate plus the live clock beats both
// force-dynamic (paid the feed fanout per visit) and pure-static (froze
// the build-time date).
export const revalidate = 300;

// Quiet utility/primary link used by the "getting around" row. Brand tone
// for the open-now door, neutral for the two utilities.
function UtilityLink({ href, icon: Icon, children, primary = false }: {
  href: string;
  icon: typeof Clock;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="tactile tactile-interactive inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold"
      style={{
        background: primary ? "var(--app-brand)" : "var(--app-bg-elevated)",
        color: primary ? "#fff" : "var(--app-ink-2)",
        boxShadow: primary ? undefined : "var(--app-edge), var(--app-hi)",
      }}
    >
      <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      {children}
    </Link>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const now = new Date();

  // ONE unified public event set — the same shared loader /events renders
  // from, so a window count can never disagree between the two pages.
  const { publicEvents } = await assembleUnifiedEvents(now);
  const featuredEvent = pickFeaturedEvent(now, publicEvents);

  // Per-mode counts for the scrubber segments — computed from the same
  // helper that renders each window, so chip and list always agree.
  const counts: Partial<Record<TodayTimeMode, number>> = {};
  for (const m of ["now", "tonight", "tomorrow", "weekend"] as const) {
    counts[m] = eventsForMode(m, now, publicEvents).items.length;
  }

  // Default mode: the first populated window in priority order, so the
  // page never opens on an empty list when something is on one chip over.
  function pickDefaultMode(): TodayTimeMode {
    if ((counts.now ?? 0) > 0) return "now";
    if ((counts.tonight ?? 0) > 0) return "tonight";
    if ((counts.tomorrow ?? 0) > 0) return "tomorrow";
    return "weekend";
  }
  const mode: TodayTimeMode = isTodayTimeMode(t) ? t : pickDefaultMode();

  // The active window. The featured hero is filtered out of the shelf so
  // a single event renders exactly once (Rule 2 / the duplicate-title
  // gate). Capped at 3 (hero + 2 tiles): P1's windows are "the hero plus
  // a short list," and the shelf was most of the line+byte weight. The
  // full list is one tap away on /events ("See all").
  const slice = eventsForMode(mode, now, publicEvents);
  const sliceItems = slice.items.slice(0, 3);
  const heroInSlice = featuredEvent && sliceItems.some((e) => e.slug === featuredEvent.slug);
  const upcomingRest = heroInSlice
    ? sliceItems.filter((e) => e.slug !== featuredEvent!.slug)
    : sliceItems;

  // Empty-window nudge: point at a DIFFERENT window that actually has
  // events, never back to the same empty one.
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
    <div className="relative space-y-5">
      <PageBloom />

      {/* Stale-shell guard: a cached SW/CDN shell can present a days-old
          render as "today." The client compares render day with device
          day, silently reloads once, then shows an honest banner. */}
      <FreshnessGuard renderedAtIso={now.toISOString()} />

      {/* 1 — THE CANVAS. The weekday is the page's <h1> (asHeading); the
          one weather sentence + readout (TodayCard, no event line so it
          never duplicates the scrubber hero) rides the time-of-day sky
          gradient; the compact forecast strip caps it. The full weather
          block (hourly / 7-day / more details) was deleted in this pass —
          rule 6, weather is context, not a forecast app. */}
      <SkyHero className="relative z-10 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.22)]">
        <DateLine asHeading />
        <div className="mt-3">
          <Suspense fallback={<Skeleton.Block height={120} round="var(--app-radius-md)" />}>
            <TodayCard />
          </Suspense>
        </div>
      </SkyHero>
      <Suspense fallback={null}>
        <ForecastLine />
      </Suspense>

      {/* 2 — HEADS UP. Self-hides when nothing is active; one worst-first
          sourced alert with a quiet link to /alerts. */}
      <Suspense fallback={null}>
        <CivicAlerts />
      </Suspense>

      {/* 3 — CRAVINGS. Category chips first: "I want ___ right now" →
          nearest open one. The fast lane. */}
      <CravingStrip />

      {/* 4 — GETTING AROUND. The open-now intent is one action row into
          the map's open-now state (replacing the killed "<N> places open"
          stat card); parking and transit are two quiet utility links, not
          full plates. */}
      <div className="flex flex-wrap gap-2">
        <UtilityLink href="/map?mode=browse&open=now" icon={Clock} primary>
          What&rsquo;s open near you
        </UtilityLink>
        <UtilityLink href="/parking" icon={Car}>
          Parking downtown
        </UtilityLink>
        <UtilityLink href="/transit" icon={Train}>
          MARC &amp; transit
        </UtilityLink>
      </div>

      {/* 5 — WHAT'S ON. The time scrubber. The When? control swaps the
          window in place of question marks; the hero renders exactly once
          (filtered out of the shelf below it). */}
      <section className="space-y-3" aria-label="What's on">
        <TimeToggle active={mode} counts={counts} />
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
                <Link href={`/?t=${fallbackSlice}`} className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
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

      {/* 6 — WORTH A LOOK. The one editorial pick module (self-hides when
          the daily lineup is empty). */}
      <Suspense fallback={<Skeleton.Block height={150} round="var(--app-radius-lg)" />}>
        <WorthALook />
      </Suspense>

      {/* 7 — THE PLAN. The P4 horizontal snap deck (MoveStack builds the
          itinerary server-side, PlanDeck renders the deck). Self-hides
          when fewer than two stops resolve. */}
      <Suspense fallback={<Skeleton.Block height={200} round="var(--app-radius-lg)" />}>
        <MoveStack />
      </Suspense>

      {/* 8 — PERSONAL. Both self-hiding: saved places open right now, and
          the visitor "stay" door (residents never see it). */}
      <FromYourSaved />
      <VisitorStayPrompt />

      {/* 9 — FOOTER. The drone-book promo, demoted from mid-feed (and
          stripped from the visible-line budget, which decomposes <footer>). */}
      <footer className="pt-2">
        <FromAboveCta />
      </footer>
    </div>
  );
}
