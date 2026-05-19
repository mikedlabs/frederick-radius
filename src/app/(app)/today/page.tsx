import type { Metadata } from "next";
import { Suspense } from "react";
import HomeWeatherStrip from "@/components/today/HomeWeatherStrip";
import CivicAlerts from "@/components/today/CivicAlerts";
import PrimaryActionCard from "@/components/today/PrimaryActionCard";
import MunicipalityStrip from "@/components/today/MunicipalityStrip";
import SectionHeading from "@/components/ui/SectionHeading";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import { placesWithinRadius } from "@/lib/loaders/places";
import { allUpcoming } from "@/lib/loaders/events";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * The home answers one question first — what should I do near me right
 * now — then opens the door to the whole county. Order:
 *   1. Weather strip       — the single conditions row
 *   2. Civic alerts        — only when something is actually active
 *   3. Primary action card — time-aware, one button (the focal element)
 *   4. Open now strip      — closest open places
 *   5. Coming up strip     — the next events
 *   6. Explore the county  — the path into towns + the rest of Frederick
 * Deep browsing and reference data live behind Explore, surfaced here
 * so the platform's depth is visible from the first screen.
 */
export const metadata: Metadata = {
  description:
    "What's open, what's happening, and what's worth your time across Frederick County right now.",
};

export const revalidate = 60;

export default async function HomePage() {
  const now = new Date();
  const origin = FREDERICK_CENTER;

  // Places and events are in-memory loaders (synchronous); the only
  // network work on the home is the weather strip and civic alerts,
  // which fetch in parallel inside their own components and stream in
  // via Suspense.
  const openNow = placesWithinRadius(origin, 8000, now)
    .filter((p) => p.open_status.state !== "closed")
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))
    .slice(0, 10);

  const upcoming = allUpcoming(now).slice(0, 7);

  return (
    <div className="space-y-5">
      {/* 1 — Weather strip */}
      <Suspense
        fallback={
          <div
            className="tactile h-[58px] rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
            aria-hidden
          />
        }
      >
        <HomeWeatherStrip />
      </Suspense>

      {/* 2 — Civic alerts. Time-critical, so above the focal action.
          The component returns null when nothing is active, so the
          calm baseline costs nothing and the layout never shifts. */}
      <Suspense fallback={null}>
        <CivicAlerts />
      </Suspense>

      {/* 3 — Primary action card (the one focal element) */}
      <PrimaryActionCard now={now} />

      {/* 4 — Open now. SectionHeading + the shared .shelf-rail (snap
          scroll, edge fade), rendered server-side and visible on first
          paint: the home's core content never waits on a scroll-in
          animation. */}
      {openNow.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Open now" href="/radius" cta="See all" />
          <div className="-mx-4 px-4">
            <div className="shelf-rail gap-3 pb-1">
              {openNow.map((p) => (
                <div key={p.slug} className="w-[280px] shrink-0">
                  <PlaceCard place={p} variant="grid" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5 — Coming up. Its card images are lazy-loaded so it costs
          nothing above the fold. */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Coming up" href="/events" cta="See all" />
          <div className="-mx-4 px-4">
            <div className="shelf-rail gap-3 pb-1">
              {upcoming.map((e) => (
                <div key={e.slug} className="w-[280px] shrink-0">
                  <EventCard event={e} variant="tile" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 6 — Explore the county. The home is not a dead end: it opens
          onto every town and the rest of Frederick via the Explore
          front door. Quiet supporting content, not a second focal. */}
      <section className="space-y-3">
        <SectionHeading title="Explore the county" href="/explore" cta="See all" />
        <MunicipalityStrip />
      </section>
    </div>
  );
}
