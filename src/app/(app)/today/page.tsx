import type { Metadata } from "next";
import { Suspense } from "react";
import WeatherHero from "@/components/today/WeatherHero";
import PrimaryActionCard from "@/components/today/PrimaryActionCard";
import SkyHero from "@/components/today/SkyHero";
import AdaptiveGreeting from "@/components/today/AdaptiveGreeting";
import NowStrip from "@/components/today/NowStrip";
import CivicAlerts from "@/components/today/CivicAlerts";
import PulseSummary from "@/components/today/PulseSummary";
import LocalNewsStrip from "@/components/today/LocalNewsStrip";
import FeaturedTonight from "@/components/today/FeaturedTonight";
import RightNow from "@/components/today/RightNow";
import PhotoMosaic from "@/components/today/PhotoMosaic";
import RedditPulse from "@/components/today/RedditPulse";
import HistoryPulse from "@/components/today/HistoryPulse";
import DecorativeDivider from "@/components/ui/DecorativeDivider";
import MunicipalityStrip from "@/components/today/MunicipalityStrip";
import DismissibleSection from "@/components/today/DismissibleSection";
import HiddenSectionsBar from "@/components/today/HiddenSectionsBar";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";
import StatStrip from "@/components/ui/StatStrip";
import { allUpcoming } from "@/lib/loaders/events";
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { FREDERICK_CENTER } from "@/lib/geo";
import { PLACES } from "@/data/places";
import { EVENTS } from "@/data/events";
import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * Today — the editorial briefing.
 *
 * Each module is a different mode (greeting, conditions, action,
 * urgent civic, quiet civic, editorial news, identity, editorial
 * place, visual mosaic, discovery, agenda, local voice, geography),
 * stacked so the page reads as a layered briefing instead of two
 * carousels.
 *
 * Every section below the hero is wrapped in DismissibleSection so
 * users hide what they don't want. Hidden sections surface in
 * HiddenSectionsBar at the bottom for one-tap restore.
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

const HIDDEN_LABELS: Array<{ id: string; label: string }> = [
  { id: "stats", label: "By the numbers" },
  { id: "featured-place", label: "Worth your evening" },
  { id: "photo-mosaic", label: "Looks like Frederick" },
  { id: "featured-event", label: "Don't miss" },
  { id: "coming-up", label: "Coming up" },
  { id: "reddit", label: "What people are saying" },
  { id: "towns", label: "Around the county" },
];

export default async function HomePage() {
  const now = new Date();

  const stats = [
    { label: "Places", value: PLACES.length },
    { label: "Events", value: EVENTS.length },
    { label: "Towns", value: MUNICIPALITIES.length },
  ];
  const featuredPlace = pickFeaturedPlace(now);
  const featuredEvent = pickFeaturedEvent(now);
  const upcoming = allUpcoming(now).slice(0, 7);
  // Filter out the featured event so it doesn't appear twice.
  const upcomingRest = featuredEvent
    ? upcoming.filter((e) => e.slug !== featuredEvent.slug)
    : upcoming;
  return (
    <div className="relative space-y-6">
      <PageBloom />

      {/* 1 — Sky-tinted hero. Greeting + sun countdown + civic alert
          (when active) + weather (now and the 7-day, on one card) +
          plan card, layered on the time-of-day gradient. CivicAlerts
          lives INSIDE SkyHero so an active alert reads as part of the
          hero unit, not as a strange floating banner between the page
          header and the sky gradient. */}
      {/* 0 — NowStrip: the at-a-glance briefing. Stitches current
          weather + sunset + places-open-now + closing-soon + events-
          starting-soon into one editorial paragraph. This is the
          differentiator card — what makes the app worth opening
          instead of Googling. Renders ABOVE the sky hero so it's the
          first thing the eye lands on. */}
      <Suspense fallback={null}>
        <NowStrip />
      </Suspense>

      <SkyHero className="space-y-4">
        <Suspense fallback={null}>
          <AdaptiveGreeting />
        </Suspense>
        <Suspense fallback={null}>
          <CivicAlerts />
        </Suspense>
        <Suspense
          fallback={
            <div
              className="tactile h-[180px] rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
              aria-hidden
            />
          }
        >
          <WeatherHero />
        </Suspense>
        <PrimaryActionCard now={now} />
      </SkyHero>

      {/* 3 — One quiet civic line. */}
      <Suspense fallback={null}>
        <PulseSummary />
      </Suspense>

      {/* 4 — Local news desk. Has its own header + hide UX. */}
      <Suspense fallback={null}>
        <LocalNewsStrip />
      </Suspense>

      {/* 5 — Identity numbers. */}
      <DismissibleSection id="stats" title="Across Frederick County">
        <StatStrip stats={stats} />
      </DismissibleSection>

      {/* 6 — Editorial place. */}
      {featuredPlace && (
        <DismissibleSection id="featured-place" title="Worth your evening">
          <FeaturedTonight place={featuredPlace} />
        </DismissibleSection>
      )}

      <DecorativeDivider variant="wave" />

      {/* 7 — Photo mosaic. Six-tile real-place wall. */}
      <DismissibleSection id="photo-mosaic" title="Looks like Frederick">
        <PhotoMosaic />
      </DismissibleSection>

      <DecorativeDivider variant="sun" />

      {/* 7a — Frederick County history pulse — "Did you know" card,
          rotates daily. Connects users to the place's depth (it's
          older than the country) instead of leaving them in only
          "things to eat today". */}
      <DismissibleSection id="history" title="Frederick County in 1 fact">
        <HistoryPulse />
      </DismissibleSection>

      {/* 8 — Time-aware curated places (component owns its own header). */}
      <RightNow now={now} />

      {/* 9 — Featured event hero — magazine card for the next photo-
          backed event so the top of the events queue isn't just a
          shelf tile. */}
      {featuredEvent && (
        <DismissibleSection id="featured-event" title="Don't miss">
          <EventCard event={featuredEvent} variant="feature" />
        </DismissibleSection>
      )}

      {/* 10 — Coming up shelf (the rest of the queue). */}
      {upcomingRest.length > 0 && (
        <DismissibleSection
          id="coming-up"
          title="Coming up"
          href="/events"
          cta="See all"
        >
          <div className="-mx-4 px-4">
            <div className="shelf-rail gap-3 pb-1">
              {upcomingRest.map((e) => (
                <div key={e.slug} className="w-[280px] shrink-0">
                  <EventCard event={e} variant="tile" />
                </div>
              ))}
            </div>
          </div>
        </DismissibleSection>
      )}

      {/* 11 — What people are saying — the local voice signal. */}
      <DismissibleSection id="reddit" title="What people are saying">
        <Suspense fallback={null}>
          <RedditPulse />
        </Suspense>
      </DismissibleSection>

      {/* 12 — County geography. */}
      <DismissibleSection
        id="towns"
        title="Around the county"
        href="/m"
        cta="All towns"
      >
        <MunicipalityStrip />
      </DismissibleSection>

      {/* Hidden sections bar — surfaces only when the user has
          dismissed at least one section. Lets them bring any
          section back with one tap. */}
      <HiddenSectionsBar sections={HIDDEN_LABELS} />
    </div>
  );
}
