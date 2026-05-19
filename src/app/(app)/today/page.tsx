import type { Metadata } from "next";
import { Suspense } from "react";
import HomeWeatherStrip from "@/components/today/HomeWeatherStrip";
import PrimaryActionCard from "@/components/today/PrimaryActionCard";
import SectionHeading from "@/components/ui/SectionHeading";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import { placesWithinRadius } from "@/lib/loaders/places";
import { allUpcoming } from "@/lib/loaders/events";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * The home answers exactly one question: what should I do near me
 * right now. Four sections, in order, and nothing else:
 *   1. Weather strip       — the single conditions row
 *   2. Primary action card — time-aware, one button
 *   3. Open now strip      — closest open places
 *   4. Coming up strip     — the next events
 * Discovery, browsing, and reference data live in the tabs, not here.
 */
export const metadata: Metadata = {
  description: "What's open, what's happening, and what's worth your time in Frederick County right now.",
};

export const revalidate = 60;

export default async function HomePage() {
  const now = new Date();
  const origin = FREDERICK_CENTER;

  // Places and events are in-memory loaders (synchronous); the only
  // network work on the home is the weather strip, which fetches in
  // parallel inside its own component and streams in via Suspense.
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

      {/* 2 — Primary action card */}
      <PrimaryActionCard now={now} />

      {/* 3 — Open now. SectionHeading + the shared .shelf-rail (snap
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

      {/* 4 — Coming up. Last on the page; its card images are
          lazy-loaded so it costs nothing above the fold. */}
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
    </div>
  );
}
