import type { Metadata } from "next";
import { Suspense } from "react";
import WeatherStrip from "@/components/today/WeatherStrip";
import AirQualityBadge from "@/components/today/AirQualityBadge";
import CivicAlerts from "@/components/today/CivicAlerts";
import PulseSummary from "@/components/today/PulseSummary";
import LocalNewsStrip from "@/components/today/LocalNewsStrip";
import MunicipalityStrip from "@/components/today/MunicipalityStrip";
import SkyHero from "@/components/today/SkyHero";
import AdaptiveGreeting from "@/components/today/AdaptiveGreeting";
import FloatingPlanFab from "@/components/today/FloatingPlanFab";
import TodayTabs from "@/components/today/TodayTabs";
import PullToRefresh from "@/components/today/PullToRefresh";
import ModeAwareCta from "@/components/today/ModeAwareCta";
import ModeLead from "@/components/today/ModeLead";
import LiveActivityPill from "@/components/today/LiveActivityPill";
import FeaturedTonight from "@/components/today/FeaturedTonight";
import FeaturedEvents, { type EventSlide } from "@/components/today/FeaturedEvents";
import RightNow from "@/components/today/RightNow";
import NearbyNow from "@/components/today/NearbyNow";
import HiddenSectionsBar from "@/components/today/HiddenSectionsBar";
import { buildActivities } from "@/lib/live-activity";
import { getNwsForecast } from "@/lib/integrations/nws";
import { getFrederickTrails } from "@/lib/integrations/fcTrails";
import { getFrederickParks } from "@/lib/integrations/fcParks";
import { getFrederickArt } from "@/lib/integrations/fcArtTour";
import { getFrederickHistoricPlaces } from "@/lib/integrations/mdHistoricPlaces";
import { getFrederickTransitRoutes } from "@/lib/integrations/transitFrederick";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { isFarmersMarket } from "@/lib/farmersMarkets";
import { AMENITY_COUNT } from "@/lib/loaders/amenities";
import { Mountain, Trees, Palette, Landmark, Sprout, Bus, Waves, MapPinned } from "lucide-react";

/**
 * The live-county-data sources, consolidated into ONE "Explore
 * Frederick" hub instead of seven stacked full-width cards (which had
 * begun to read like the directory the app deliberately is not). Each
 * keeps its established per-source accent so the color still means
 * what it means elsewhere in the app.
 */
const EXPLORE_LINKS = [
  { href: "/trails", label: "Trails", desc: "Maintained trails", icon: Mountain, color: "var(--app-positive, #1E6B3A)" },
  { href: "/parks", label: "Parks", desc: "Parks & open space", icon: Trees, color: "var(--app-brand-2, #1E3A2F)" },
  { href: "/art", label: "Public art", desc: "Murals & sculptures", icon: Palette, color: "var(--app-accent)" },
  { href: "/historic", label: "Historic", desc: "National Register", icon: Landmark, color: "var(--app-brand, #C4451C)" },
  { href: "/markets", label: "Markets", desc: "Farmers markets", icon: Sprout, color: "var(--app-positive, #1E6B3A)" },
  { href: "/transit", label: "Transit", desc: "County bus routes", icon: Bus, color: "var(--app-cool)" },
  { href: "/water", label: "Rivers", desc: "Live water levels", icon: Waves, color: "var(--app-cool)" },
  { href: "/amenities", label: "Amenities", desc: "Restrooms, Wi-Fi, charging, more", icon: MapPinned, color: "var(--app-cool)" },
] as const;

/**
 * The Explore hub, presentational. `counts` is a live per-source
 * tally; a tile shows a badge only when its count is > 0, so the hub
 * degrades cleanly (no badge) for any source that is briefly
 * unreachable. Rendered both as the instant Suspense fallback (empty
 * counts) and, streamed in, with the real numbers.
 */
function ExploreHub({ counts }: { counts: Record<string, number> }) {
  return (
    <FadeUp>
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Explore Frederick
          </h2>
          <span className="shrink-0 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Live county data
          </span>
        </div>
        <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EXPLORE_LINKS.map((e) => {
            const Icon = e.icon;
            const n = counts[e.href] ?? 0;
            return (
              <Surface
                key={e.href}
                href={e.href}
                interactive
                radius="var(--app-radius-md)"
                className="flex items-center gap-2.5 px-3 py-2.5"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{ background: `color-mix(in srgb, ${e.color} 16%, transparent)` }}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" strokeWidth={2} style={{ color: e.color }} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {e.label}
                  </span>
                  <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                    {e.desc}
                  </span>
                </span>
                {n > 0 && (
                  <Chip color={e.color} tabular className="ml-auto shrink-0">
                    {n.toLocaleString()}
                  </Chip>
                )}
              </Surface>
            );
          })}
        </div>
      </section>
    </FadeUp>
  );
}

/**
 * Streams the live counts in parallel without blocking Today. Every
 * getter is already graceful (returns [] on any failure), so a slow or
 * unreachable feed simply yields no badge for that tile.
 */
async function ExploreHubData() {
  const [trails, parks, art, historic, transit, water] = await Promise.all([
    getFrederickTrails().then((a) => a.length).catch(() => 0),
    getFrederickParks().then((a) => a.length).catch(() => 0),
    getFrederickArt().then((a) => a.length).catch(() => 0),
    getFrederickHistoricPlaces().then((a) => a.length).catch(() => 0),
    getFrederickTransitRoutes().then((a) => a.length).catch(() => 0),
    getFrederickWaterSites().then((a) => a.length).catch(() => 0),
  ]);
  const markets = publicPlaces().filter((p) => isFarmersMarket(p.name)).length;
  const counts: Record<string, number> = {
    "/trails": trails,
    "/parks": parks,
    "/art": art,
    "/historic": historic,
    "/markets": markets,
    "/transit": transit,
    "/water": water,
    "/amenities": AMENITY_COUNT,
  };
  return <ExploreHub counts={counts} />;
}
import FadeUp from "@/components/ui/FadeUp";
import { Surface } from "@/components/ui/Surface";
import { Chip } from "@/components/ui/Chip";
import { ShimmerWeatherStrip, ShimmerCard } from "@/components/ui/Shimmer";
import { rankPlaces, placesWithinRadius, decoratePlace, likelyOpenPlaces, publicPlaces, publicPlaceBySlug } from "@/lib/loaders/places";
import { eventsLive, eventsNext24h, eventsWeekend, allUpcoming, seriesKey, formatEventWhen } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
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
  // "Open now": Google-verified open first (so we do not lie). When that
  // is thin (hours coverage is low), supplement with curated reliable
  // windows tagged "likely" so the panel is never a defeating empty
  // state. P0-6.
  const verifiedOpen = rankPlaces({ origin, now, preferOpen: true, limit: 30 })
    .filter((p) => p.hours_verified && p.open_status.state === "open")
    .map((p) => ({ ...p, open_confidence: "verified" as const }));
  const openNow =
    verifiedOpen.length >= 5
      ? verifiedOpen.slice(0, 8)
      : [
          ...verifiedOpen,
          ...likelyOpenPlaces(origin, now).filter(
            (l) => !verifiedOpen.some((v) => v.slug === l.slug),
          ),
        ].slice(0, 8);
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
  const featuredPool = publicPlaces().filter((p) => p.source !== "dfp")
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

  // Featured city events — the rotating "what's going on" hero. Dedupe by
  // series (so a weekly series isn't 6 identical slides), city of Frederick
  // first, soonest first. Each slide borrows its venue's real photo.
  const liveSet = new Set(liveEvents.map((e) => e.slug));
  const next24 = eventsNext24h(now);
  const next24Set = new Set(next24.map((e) => e.slug));
  const weekendSet = new Set(eventsWeekend(now).map((e) => e.slug));
  const eventBySeries = new Map<string, ReturnType<typeof allUpcoming>[number]>();
  for (const e of [...liveEvents, ...next24, ...eventsWeekend(now), ...allUpcoming(now)]) {
    const k = seriesKey(e);
    const cur = eventBySeries.get(k);
    if (!cur || +new Date(e.starts_at) < +new Date(cur.starts_at)) eventBySeries.set(k, e);
  }
  // Resolve each event's venue photo once, then rank: city of Frederick
  // first, then slides that have a real photo, then soonest.
  const withPhoto = [...eventBySeries.values()].map((e) => {
    const vp = e.venue_place_slug ? publicPlaceBySlug(e.venue_place_slug) : null;
    const photo =
      (vp ? decoratePlace(vp, origin, now).google_photo_url : undefined) ||
      e.hero_image ||
      null;
    return { e, photo };
  });
  withPhoto.sort(
    ({ e: a, photo: pa }, { e: b, photo: pb }) =>
      (a.municipality === "frederick" ? 0 : 1) - (b.municipality === "frederick" ? 0 : 1) ||
      (pa ? 0 : 1) - (pb ? 0 : 1) ||
      +new Date(a.starts_at) - +new Date(b.starts_at)
  );
  const featuredEvents: EventSlide[] = withPhoto.slice(0, 6).map(({ e, photo }) => {
    const cat = CATEGORY_BY_SLUG[e.category];
    return {
      slug: e.slug,
      title: e.title,
      when: formatEventWhen(e),
      venue: e.venue_name,
      eyebrow: liveSet.has(e.slug)
        ? "Happening now"
        : next24Set.has(e.slug)
          ? "Next 24 hours"
          : weekendSet.has(e.slug)
            ? "This weekend"
            : "Coming up",
      photo,
      categoryName: cat?.name ?? e.category_name ?? e.category,
      color: cat?.color ?? "#C4451C",
    };
  });

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

        {/* Mode-aware quick start — Resident vs Visitor actually
            changes what the app foregrounds (one toggle, here). */}
        <FadeUp>
          <ModeLead />
        </FadeUp>

        {liveActivities.length > 0 && (
          <LiveActivityPill activities={liveActivities} />
        )}

        {/* Photo-forward featured hero — rotating city events, with the
            top place as a graceful fallback if there's nothing on. */}
        {featuredEvents.length > 0 ? (
          <FadeUp>
            <FeaturedEvents events={featuredEvents} />
          </FadeUp>
        ) : featured ? (
          <FadeUp>
            <FeaturedTonight place={featured} />
          </FadeUp>
        ) : null}

        {/* Explore by town — promoted near the top (owner: it's
            important). Visual tiles with real place counts, no longer
            buried in a collapsed drawer at the bottom. */}
        <FadeUp>
          <section className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                Explore by town
              </h2>
              <span className="shrink-0 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                Every town &amp; community
              </span>
            </div>
            <MunicipalityStrip />
          </section>
        </FadeUp>

        {/* Explore Frederick — ONE hub for the live county-data
            sources, with per-source live count badges streamed in via
            Suspense (the empty-count hub renders instantly). */}
        <Suspense fallback={<ExploreHub counts={{}} />}>
          <ExploreHubData />
        </Suspense>

        {/* Location-aware, county-wide "around you right now" — fuses the
            user's actual position to municipality + civic + nearest open
            places + live/soon events via the connectivity layer. Opt-in,
            on-device, one tap to clear. The companion to time-aware
            discovery below. */}
        <FadeUp>
          <NearbyNow />
        </FadeUp>

        {/* Time-aware discovery: morning coffee, evening dinner, etc.
            Open or likely-open only, and the user can hide it. */}
        <FadeUp>
          <RightNow origin={origin} now={now} />
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

        {/* ── ZONE 3 · Explore ──────────────────────────────── */}
        {/* News is its own visible card rail now, not buried in a
            collapsed drawer (owner: "needs visuals"). */}
        <FadeUp>
          <Suspense fallback={<ShimmerCard rows={3} />}>
            <LocalNewsStrip />
          </Suspense>
        </FadeUp>

        {/* One quiet civic line — the full board lives at /pulse, this
            is just the single most-urgent status (or "all clear"). */}
        <FadeUp>
          <Suspense fallback={null}>
            <PulseSummary />
          </Suspense>
        </FadeUp>

        <HiddenSectionsBar
          sections={[
            { id: "right-now", label: "Right now" },
          ]}
        />
      </div>
    </>
  );
}
