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
    <div className="relative space-y-5">
      <PageBloom variant="cool" />
      {/* No page-level header — the RadiusRing IS the headline; the
          user lands directly on the interactive tool. The page title
          lives in metadata and the bottom-nav label. */}
      <RadiusBuilder places={OPEN_PLACES} amenities={OPEN_AMENITIES} />
    </div>
  );
}
