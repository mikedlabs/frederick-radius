import type { Metadata } from "next";
import { Suspense } from "react";
import WeatherHero from "@/components/today/WeatherHero";
import PrimaryActionCard from "@/components/today/PrimaryActionCard";
import SkyHero from "@/components/today/SkyHero";
import AdaptiveGreeting from "@/components/today/AdaptiveGreeting";
import CivicAlerts from "@/components/today/CivicAlerts";
import PulseSummary from "@/components/today/PulseSummary";
import LocalNewsStrip from "@/components/today/LocalNewsStrip";
import FeaturedTonight from "@/components/today/FeaturedTonight";
import RightNow from "@/components/today/RightNow";
import HistoryPulse from "@/components/today/HistoryPulse";
import DismissibleSection from "@/components/today/DismissibleSection";
import HiddenSectionsBar from "@/components/today/HiddenSectionsBar";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";
import Skeleton from "@/components/ui/Skeleton";
import TimeToggle, { isTodayTimeMode, type TodayTimeMode } from "@/components/today/TimeToggle";
import { allUpcoming, eventsLive, eventsWeekend, eventsOnDay } from "@/lib/loaders/events";
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * Today — the editorial briefing.
 *
 * Tightened from the original 11+ stacked modules down to a 7-section
 * spine that reads as one continuous briefing — the SkyHero is the
 * front door, no preamble card stacked above it:
 *
 *   1. Hero          → greeting + sun + civic alert + weather + plan
 *   2. Civic pulse   → one quiet line (PulseSummary)
 *   3. Local newsroom→ source-first news desk
 *   4. Worth tonight → one editorial place card
 *   5. Right now     → time-aware curated places
 *   6. Upcoming      → featured event hero + the rest of the queue
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

function pickFeaturedPlace(now: Date): PlaceCardData | null {
  const ranked = rankPlaces({
    origin: FREDERICK_CENTER,
    now,
    preferOpen: true,
    limit: 120,
  });
  const candidate = ranked
    .filter((p) => Boolean(p.google_photo_url))
    .filter((p) => p.open_status.state !== "closed")
    .filter((p) => EVENING_CATEGORIES.has(p.category))
    .filter((p) => (p.google_rating ?? 0) >= 4.3)
    .sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0))[0];
  return candidate ?? null;
}

/** Pick the next photo-backed marquee event for the hero card.
 *  Photo-led entries (Alive @ Five, Sky Stage) outrank text-only
 *  rows so the feature card always has imagery to carry — AND
 *  exclude administrative/private-sounding rows (board meetings,
 *  rehearsal dinners, prenatal classes) so the hero never carries
 *  a clinical entry. */
function pickFeaturedEvent(now: Date) {
  const upcoming = allUpcoming(now).filter(
    (e) => !NON_PUBLIC_EVENT.test(e.title ?? ""),
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

// Resolve a temporal mode to a per-mode event window. Each mode has
// its own headline so the Upcoming section reads as the answer to a
// specific question, not as a generic feed.
function eventsForMode(mode: TodayTimeMode, now: Date) {
  if (mode === "now") {
    // Live right now OR starting in the next 90 minutes.
    const inNext90 = allUpcoming(now).filter((e) => {
      const ms = new Date(e.starts_at).getTime() - now.getTime();
      return ms >= 0 && ms <= 90 * 60_000;
    });
    return { title: "Happening now", items: [...eventsLive(now), ...inNext90] };
  }
  if (mode === "tonight") {
    // Today after 16:00 ET → tomorrow 02:30 ET. "Tonight" still
    // means tonight at 11pm, not "yesterday."
    const today = new Date(now);
    today.setHours(16, 0, 0, 0);
    const startMs = Math.max(now.getTime(), today.getTime());
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 30, 0, 0);
    const endMs = tomorrow.getTime();
    return {
      title: "Tonight",
      items: allUpcoming(now).filter((e) => {
        const ms = Date.parse(e.starts_at);
        return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
      }),
    };
  }
  if (mode === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { title: "Tomorrow", items: eventsOnDay(tomorrow) };
  }
  return { title: "This weekend", items: eventsWeekend(now) };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const mode: TodayTimeMode = isTodayTimeMode(t) ? t : "now";
  const now = new Date();

  const featuredPlace = pickFeaturedPlace(now);
  const featuredEvent = pickFeaturedEvent(now);
  // Per-mode event window — title + items both come from one helper
  // so chip and rendered section never disagree.
  const slice = eventsForMode(mode, now);
  // Pre-compute per-mode counts so the chip strip shows "Tonight · 3"
  // without forcing a click into an empty surface.
  const counts: Partial<Record<TodayTimeMode, number>> = {};
  for (const m of ["now", "tonight", "tomorrow", "weekend"] as const) {
    counts[m] = eventsForMode(m, now).items.length;
  }
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
       *  Upcoming section between Now / Tonight / Tomorrow / Weekend.
       *  Mode lives in ?t= so the view is shareable. */}
      <TimeToggle active={mode} counts={counts} />

      {/* 2 — One quiet civic line. */}
      <Suspense fallback={<Skeleton.Block height={28} round="var(--app-radius-md)" />}>
        <PulseSummary />
      </Suspense>

      {/* 3 — Local newsroom. Has its own header + lane structure.
       *  Skeleton shows a feature card + a few row stubs while the RSS
       *  fan-out resolves, so the page doesn't pop in/jump. */}
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

      {/* 4 — Editorial place. */}
      {featuredPlace && (
        <DismissibleSection id="featured-place" title="Worth your evening">
          <FeaturedTonight place={featuredPlace} />
        </DismissibleSection>
      )}

      {/* 5 — Time-aware curated places (component owns its own header). */}
      <RightNow now={now} />

      {/* 6 — Upcoming events. ONE section instead of two: the featured
          photo-led card on top, then the rest of the queue as a
          horizontal shelf. The previous two-section layout (Don't miss
          → Coming up) double-stacked event headings; one section reads
          tighter and tells the same story. */}
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
                <div className="shelf-rail gap-3 pb-1">
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

      {/* 7 — Frederick County in 1 fact. Rotates daily. */}
      <DismissibleSection id="history" title="Did you know">
        <HistoryPulse />
      </DismissibleSection>

      {/* Hidden sections bar — surfaces only when the user has
          dismissed at least one section. Lets them bring any section
          back with one tap. */}
      <HiddenSectionsBar sections={HIDDEN_LABELS} />
    </div>
  );
}
