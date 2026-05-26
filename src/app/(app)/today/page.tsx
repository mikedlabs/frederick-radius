import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import WeatherHero from "@/components/today/WeatherHero";
import FromAboveTile from "@/components/today/FromAboveTile";
import PrimaryActionCard from "@/components/today/PrimaryActionCard";
import SkyHero from "@/components/today/SkyHero";
import AdaptiveGreeting from "@/components/today/AdaptiveGreeting";
import CivicAlerts from "@/components/today/CivicAlerts";
import LocalNewsStrip from "@/components/today/LocalNewsStrip";
import RightNow from "@/components/today/RightNow";
import MoodTiles from "@/components/today/MoodTiles";
import HistoryPulse from "@/components/today/HistoryPulse";
import DismissibleSection from "@/components/today/DismissibleSection";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";
import Skeleton from "@/components/ui/Skeleton";
import TimeToggle, { isTodayTimeMode, type TodayTimeMode } from "@/components/today/TimeToggle";

// Code-split the below-the-fold client components so their JS doesn't
// land in the initial /today bundle. ssr stays on (default) so the
// HTML still includes the section for crawlers + non-JS readers.
// HiddenSectionsBar only renders for users who've dismissed something,
// so 99% of visits never need its bytes at all.
const FeaturedTonightPicker = dynamic(
  () => import("@/components/today/FeaturedTonightPicker"),
);
const HiddenSectionsBar = dynamic(
  () => import("@/components/today/HiddenSectionsBar"),
);
import { allUpcoming, eventsLive } from "@/lib/loaders/events";
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { FREDERICK_CENTER } from "@/lib/geo";
import { easternWallToUtcISO } from "@/lib/tz";

/**
 * Today — the editorial briefing.
 *
 * Tightened from the original 11+ stacked modules down to a 7-section
 * spine that reads as one continuous briefing — the SkyHero is the
 * front door, no preamble card stacked above it:
 *
 *   1. Hero          → greeting + sun + civic alert + weather + plan
 *   2. When?         → temporal toggle: Now / Tonight / Tomorrow / Weekend
 *   3. Upcoming      → featured event hero + the rest of the queue
 *   4. Local newsroom→ source-first news desk
 *   5. Worth tonight → one editorial place card
 *   6. Right now     → time-aware curated places
 *   7. History pulse → one rotating fact
 *
 * What got cut (each cut intentional, with an honest reason):
 *   • StatStrip "Across Frederick County"  — generic counts, no signal
 *   • PhotoMosaic "Looks like Frederick"   — pretty but redundant with
 *                                            the photo-heavy cards above
 *   • RedditPulse                           — noisy subreddit posts;
 *                                            users opt in if they want
 *   • MunicipalityStrip                     — towns accessible via /m
 *   • DecorativeDivider variants            — visual filler, not content
 *
 * Sections still wrap in DismissibleSection so users can hide any of
 * the remaining ones; HiddenSectionsBar at the foot restores them.
 */
export const metadata: Metadata = {
  description: "What's open, what's happening, and what's worth your time in Frederick County right now.",
};

export const revalidate = 60;

// "Worth your evening" must read as a destination, not whatever the
// directory happens to have ranked highest. Birthing classes, dialysis
// clinics, and county-permits offices all technically can hit the top
// of the rated list — that's what the design audits flagged. Restrict
// to categories that ARE an evening out.
const EVENING_CATEGORIES: ReadonlySet<string> = new Set([
  "restaurant", "bar", "brewery", "coffee", "bakery", "pizza",
  "music", "theater", "gallery", "museum",
  "lodging", "market",
]);

// Event titles that look like internal/admin business — board meetings,
// hearings, classes, rehearsals. Public meetings live on /events under
// their own section; they don't carry a "Don't miss" hero card.
const NON_PUBLIC_EVENT = /\b(board|council|commission|hearing|workshop|rehearsal|board meeting|training|orientation|class|certification|breastfeeding|prenatal|birthing|info session|hr|policy)\b/i;

/**
 * Pick the top 5 featured-tonight candidates — the server's shortlist
 * for the editorial place card. The first one is the unconditional
 * best; the rest exist so a client wrapper can prefer a candidate
 * whose category umbrella matches a user's onboarding interest
 * (Phase D personalization). Returns an empty array when no place
 * meets the bar, which the page treats as "no card".
 */
function pickFeaturedCandidates(now: Date): PlaceCardData[] {
  const ranked = rankPlaces({
    origin: FREDERICK_CENTER,
    now,
    preferOpen: true,
    limit: 120,
  });
  return ranked
    .filter((p) => Boolean(p.google_photo_url))
    // Tightened from "not closed" → "actually open right now". The old
    // filter let through unknown/no_hours places that could be just as
    // closed as the ones we rejected; on a card that says "Worth your
    // evening" that lie burns user trust the first time they walk to a
    // dark door. If nothing is open + photo-backed + evening-category
    // + highly rated right now, render no card at all — the page
    // already handles the empty case gracefully.
    .filter((p) => p.open_status.state === "open")
    .filter((p) => EVENING_CATEGORIES.has(p.category))
    .filter((p) => (p.google_rating ?? 0) >= 4.3)
    .sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0))
    .slice(0, 5);
}

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

// Labels for the HiddenSectionsBar — IDs match the DismissibleSection
// `id`s below. Sections retired from the page are also retired from
// this list (HiddenSectionsBar only restores what still exists).
const HIDDEN_LABELS: Array<{ id: string; label: string }> = [
  { id: "featured-place", label: "Worth your evening" },
  { id: "upcoming", label: "Upcoming events" },
  { id: "history", label: "Did you know" },
];

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

  const featuredCandidates = pickFeaturedCandidates(now);
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

      {/* When? — the brand-defining temporal control. Pivots the
       *  events section between Now / Tonight / Tomorrow / Weekend.
       *  Mode lives in ?t= so the view is shareable. */}
      <TimeToggle active={mode} counts={counts} />

      {/* In the mood for — 4-up affordance tiles (Coffee / Outdoors /
       *  Eat / With kids) that deep-link into /radius with the right
       *  category pre-filtered. The brief's "answer 'what should I do
       *  right now?' before the calendar of events" pattern. */}
      <MoodTiles />

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

      {/* ── DISCOVERY ZONE ─────────────────────────────────────────
          Everything below this label is "browse if you want," not
          "you must read this." Quieter divider treatment than before:
          a single small centered label with no horizontal rules, so
          the section headings (font-serif text-xl) below remain the
          visually dominant element and the divider doesn't compete
          with them. */}
      <div className="pt-2 text-center" aria-hidden>
        <span
          className="text-[10px] font-medium uppercase tracking-[0.2em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          More around Frederick
        </span>
      </div>

      {/* Local newsroom — compact briefing. */}
      <Suspense
        fallback={
          <div aria-busy="true" className="space-y-2.5">
            <Skeleton.Block height={20} width={140} round="var(--app-radius-sm)" />
            <Skeleton.Card withPhoto={false} />
            <Skeleton.Row />
            <Skeleton.Row />
            <Skeleton.Row />
          </div>
        }
      >
        <LocalNewsStrip />
      </Suspense>

      {/* Editorial place. The picker is client-side so it can prefer a
          candidate matching the user's interests (Phase D) while the
          server-rendered first candidate is the same magazine pick
          for everyone if no interests are set. */}
      {featuredCandidates.length > 0 && (
        <DismissibleSection id="featured-place" title="Worth your evening">
          <FeaturedTonightPicker candidates={featuredCandidates} />
        </DismissibleSection>
      )}

      {/* Time-aware curated places (component owns its own header). */}
      <RightNow now={now} />

      {/* Frederick County in 1 fact. Rotates daily. */}
      <DismissibleSection id="history" title="Did you know">
        <HistoryPulse />
      </DismissibleSection>

      {/* From Above — the photography book lives here. Quiet brand
          moment that earns its place at the bottom of Today: a daily
          visitor who's scrolled past the utility tier sees the book
          we built, with one tap into the full preview experience. */}
      <FromAboveTile />

      {/* Quiet footer doors. /discover surfaces editorial picks;
          /about is the thesis page — the answer to "what is this
          app, really" that a curious first-time visitor will ask. */}
      <div
        className="space-y-1 pt-2 text-center text-[12px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <p>
          <a
            href="/discover"
            className="font-semibold hover:underline"
            style={{ color: "var(--app-brand)" }}
          >
            Hidden Frederick →
          </a>{" "}
          a daily sweep of lesser-known places.
        </p>
        <p>
          <a
            href="/about"
            className="font-semibold hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            About Frederick Radius →
          </a>{" "}
          what we do and what we won&apos;t.
        </p>
      </div>

      {/* Hidden sections bar — surfaces only when the user has
          dismissed at least one section. Lets them bring any section
          back with one tap. */}
      <HiddenSectionsBar sections={HIDDEN_LABELS} />
    </div>
  );
}
