import type { Metadata } from "next";
import { Suspense } from "react";
import WeatherStrip from "@/components/today/WeatherStrip";
import AirQualityBadge from "@/components/today/AirQualityBadge";
import CivicAlerts from "@/components/today/CivicAlerts";
import LivePulse from "@/components/today/LivePulse";
import LocalNewsStrip from "@/components/today/LocalNewsStrip";
import RedditPulse from "@/components/today/RedditPulse";
import MunicipalityStrip from "@/components/today/MunicipalityStrip";
import SkyHero from "@/components/today/SkyHero";
import AdaptiveGreeting from "@/components/today/AdaptiveGreeting";
import FloatingPlanFab from "@/components/today/FloatingPlanFab";
import TodayTabs from "@/components/today/TodayTabs";
import ExploreFooter from "@/components/today/ExploreFooter";
import PullToRefresh from "@/components/today/PullToRefresh";
import ModeAwareCta from "@/components/today/ModeAwareCta";
import LiveActivityPill from "@/components/today/LiveActivityPill";
import FeaturedTonight from "@/components/today/FeaturedTonight";
import { buildActivities } from "@/lib/live-activity";
import { getNwsForecast } from "@/lib/integrations/nws";
import FadeUp from "@/components/ui/FadeUp";
import { ShimmerWeatherStrip, ShimmerCard } from "@/components/ui/Shimmer";
import { rankPlaces, placesWithinRadius, decoratePlace } from "@/lib/loaders/places";
import { eventsLive, eventsNext24h, eventsWeekend } from "@/lib/loaders/events";
import { PLACES } from "@/data/places";
import { FREDERICK_CENTER } from "@/lib/geo";

export const metadata: Metadata = {
  description: "What's open, what's happening, and what's worth your time in Frederick County right now.",
};

export const revalidate = 60;

export default async function HomePage() {
  const now = new Date();
  const origin = FREDERICK_CENTER;

  // Live activity pill data — best-effort, no blocking
  const forecast = await getNwsForecast(origin).catch(() => null);
  const liveActivities = buildActivities({
    liveEvents: eventsLive(now).map((e) => ({ slug: e.slug, title: e.title, venue_name: e.venue_name })),
    upcomingEvents: eventsNext24h(now).slice(0, 3).map((e) => ({ slug: e.slug, title: e.title, venue_name: e.venue_name, starts_at: e.starts_at })),
    weather: forecast?.hourly[0] ?? undefined,
  });

  // Curate picks per tab
  const liveEvents = eventsLive(now);
  const todayEvents = eventsNext24h(now).slice(0, 6);
  const weekendEvents = eventsWeekend(now).slice(0, 6);
  const walkable = placesWithinRadius(origin, 1200, now)
    .filter((p) => p.open_status.state !== "closed")
    .slice(0, 8);
  // "Open now" = places with hours-verified open status (so we don't lie)
  const openNow = rankPlaces({ origin, now, preferOpen: true, limit: 30 })
    .filter((p) => p.hours_verified && p.open_status.state === "open")
    .slice(0, 8);
  // Family = parks, libraries, family-tagged, kids audience
  const familyPicks = rankPlaces({ origin, now, limit: 30 })
    .filter((p) =>
      ["park", "library", "playground", "family", "museum"].includes(p.category) ||
      (p.tags ?? []).includes("family") ||
      (p.tags ?? []).includes("kids")
    )
    .slice(0, 8);

  // Featured hero — draw directly from curated places (the ~51 that got
  // Google-enriched), NOT the global 1,331-place ranking where they'd be
  // buried under DFP entries. Highest-rated open one with a real photo,
  // rotated daily so the homepage feels fresh on repeat visits.
  const featuredPool = PLACES.filter((p) => p.source !== "dfp")
    .map((p) => decoratePlace(p, origin, now))
    .filter(
      (p) =>
        Boolean(p.google_photo_url) &&
        (p.google_rating ?? 0) >= 4.3 &&
        p.open_status.state !== "closed" &&
        p.is_operational !== "closed_permanently"
    )
    .sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0))
    .slice(0, 10);
  const dayIndex =
    Math.floor(now.getTime() / 86_400_000) % Math.max(1, featuredPool.length);
  const featured = featuredPool[dayIndex] ?? featuredPool[0] ?? null;

  return (
    <>
      <PullToRefresh />
      <FloatingPlanFab />

      <div className="space-y-6">
        {/* ── ZONE 1 · Right now ─────────────────────────────── */}
        <Suspense fallback={null}>
          <CivicAlerts />
        </Suspense>

        <SkyHero>
          <Suspense
            fallback={
              <div className="space-y-2">
                <div className="h-3 w-48 rounded bg-white/30" />
                <div className="h-8 w-64 rounded bg-white/30" />
              </div>
            }
          >
            <AdaptiveGreeting />
          </Suspense>
          <ModeAwareCta />
        </SkyHero>

        {liveActivities.length > 0 && (
          <LiveActivityPill activities={liveActivities} />
        )}

        {/* Photo-forward featured hero — the visual anchor */}
        {featured && (
          <FadeUp>
            <FeaturedTonight place={featured} />
          </FadeUp>
        )}

        {/* Compact pulse + weather row */}
        <FadeUp>
          <Suspense fallback={null}>
            <LivePulse />
          </Suspense>
        </FadeUp>

        <FadeUp>
          <Suspense fallback={<ShimmerWeatherStrip />}>
            <div className="space-y-2">
              <WeatherStrip />
              <div className="flex">
                <Suspense fallback={null}>
                  <AirQualityBadge />
                </Suspense>
              </div>
            </div>
          </Suspense>
        </FadeUp>

        {/* ── ZONE 2 · What to do (tabbed, replaces 5 separate sections) ── */}
        <FadeUp>
          <TodayTabs
            liveEvents={liveEvents}
            todayEvents={todayEvents}
            weekendEvents={weekendEvents}
            walkable={walkable}
            familyPicks={familyPicks}
            openNow={openNow}
          />
        </FadeUp>

        {/* ── ZONE 3 · Explore (quieter, collapsible) ───────── */}
        <ExploreFooter>
          <Suspense fallback={<ShimmerCard rows={3} />}>
            <LocalNewsStrip />
          </Suspense>
          <Suspense fallback={<ShimmerCard rows={3} />}>
            <RedditPulse />
          </Suspense>
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                Browse by town
              </h3>
              <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>All 12 municipalities</span>
            </div>
            <MunicipalityStrip />
          </section>
        </ExploreFooter>
      </div>
    </>
  );
}
