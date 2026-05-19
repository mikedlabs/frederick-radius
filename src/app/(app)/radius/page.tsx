import type { Metadata } from "next";
import RadiusBuilder from "@/components/radius/RadiusBuilder";
import { radiusPlaces, decoratePlace } from "@/lib/loaders/places";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";

// Radius now lives at /radius (Today is the home landing). Same
// canonical public place set as every other route: deduplicated and
// with closed businesses removed.
// Decorated SERVER-SIDE (enrichment overlay) so the ~12MB
// places-enrichment.json stays out of the client bundle; RadiusBuilder
// only recomputes the radius-relative distance.
const OPEN_PLACES = radiusPlaces().map((p) => decoratePlace(p));

// Same canonical-aware amenity de-dupe the map uses, so "what's
// within X" can never list the same picnic area eight times or
// restate a park that is already in the results.
const OPEN_AMENITIES = dedupeAmenities(
  allAmenities(),
  OPEN_PLACES.map((p) => ({ name: p.name, category: p.category, geom: p.geom })),
);

export const metadata: Metadata = {
  title: "Radius",
  description:
    "Set a point and a distance. See everything inside. The Frederick Radius signature interaction.",
};

export default function RadiusPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <p className="eyebrow">Signature interaction</p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Set a point. Set a distance. See what&apos;s inside.
        </h1>
        <p className="text-pretty text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Frederick&apos;s defining interaction: walking from your hotel, driving from a meeting, hiking from a trailhead.
        </p>
      </header>
      <RadiusBuilder places={OPEN_PLACES} amenities={OPEN_AMENITIES} />
    </div>
  );
}
