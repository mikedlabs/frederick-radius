import type { Metadata } from "next";
import RadiusHome from "@/components/radius/RadiusHome";
import TownGrid from "@/components/home/TownGrid";
import SubmitCallout from "@/components/home/SubmitCallout";
import FadeUp from "@/components/ui/FadeUp";
import { radiusPlaces } from "@/lib/loaders/places";
import { allUpcoming, eventsWeekend, type EventWithMeta } from "@/lib/loaders/events";
import { eventTrust } from "@/lib/trust";

// Phase 2/3: Radius is the home route, and the homepage is composed
// around it. The place set matches every other surface (deduped via
// RADIUS_DEDUPE, closed businesses removed).
const OPEN_PLACES = radiusPlaces();

export const metadata: Metadata = {
  description: "Set a point, set a distance — see everything inside. The Frederick Radius signature interaction.",
};

// Phase 3: the strips show trustworthy events only. "likely" is the
// live-aggregated feed; everything else (curated, verified, and the
// official partner calendars) is trustworthy enough to feature.
const isTrustworthy = (e: EventWithMeta) => eventTrust(e).level !== "likely";

export default function HomePage() {
  const now = new Date();
  const in4h = +now + 4 * 60 * 60 * 1000;

  // Server-side time + trust filtering (timezone-correct here). The
  // distance test against the live radius happens client-side in the
  // strip, which is pure lat/lng math and hydration-safe.
  const rightNow = allUpcoming(now)
    .filter(
      (e) =>
        isTrustworthy(e) &&
        +new Date(e.starts_at) <= in4h &&
        +new Date(e.ends_at) >= +now,
    )
    .slice(0, 40);

  const weekend = eventsWeekend(now).filter(isTrustworthy).slice(0, 40);

  return (
    <div className="space-y-7">
      <FadeUp>
        <header className="space-y-1.5">
          <h1
            className="font-serif text-[26px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Set a point. Set a distance. See what&apos;s inside.
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Everything within reach of where you are, across all twelve Frederick County towns.
          </p>
        </header>
      </FadeUp>

      <RadiusHome places={OPEN_PLACES} rightNow={rightNow} weekend={weekend} />

      <FadeUp>
        <TownGrid />
      </FadeUp>

      <FadeUp>
        <SubmitCallout />
      </FadeUp>
    </div>
  );
}
