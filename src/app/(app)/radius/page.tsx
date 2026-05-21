import type { Metadata } from "next";
import RadiusBuilder from "@/components/radius/RadiusBuilder";
import { radiusPlaces, decoratePlace } from "@/lib/loaders/places";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import PageBloom from "@/components/ui/PageBloom";

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
    "Set a point, set a distance — see everything inside. The Frederick Radius signature interaction.",
};

export default function RadiusPage() {
  return (
    <div className="relative space-y-3">
      <PageBloom variant="cool" />
      {/* No page-level header. On a 375x812 mobile viewport the
          marketing prose ate ~190px and pushed the controls below
          the fold. The map + ribbon overlay IS the headline now. */}
      <RadiusBuilder places={OPEN_PLACES} amenities={OPEN_AMENITIES} />
    </div>
  );
}
