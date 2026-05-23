import type { Metadata } from "next";
import RadiusBuilder from "@/components/radius/RadiusBuilder";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import CLIENT_PLACES_RAW from "@/data/places-client.json" with { type: "json" };
import PageBloom from "@/components/ui/PageBloom";

// Amenities are still server-fetched + de-duped against the public
// place set so "what's within X" never lists the same picnic area
// eight times or restates a park already in the place results. We
// read places-client.json directly (the pre-baked slim set the
// browser already gets) instead of running decoratePlace x 1700
// at build time on every server render — the prior shape inlined
// roughly 4MB of decorated places into /radius's HTML for the SSR pass.
const CLIENT_PLACES_FOR_DEDUPE = (
  CLIENT_PLACES_RAW as unknown as Array<{
    name: string;
    category: string;
    geom: { lng: number; lat: number };
  }>
).map((p) => ({ name: p.name, category: p.category, geom: p.geom }));

const OPEN_AMENITIES = dedupeAmenities(allAmenities(), CLIENT_PLACES_FOR_DEDUPE);

export const metadata: Metadata = {
  title: "Radius",
  description:
    "Set a point, set a distance, see everything inside. The Frederick Radius signature interaction.",
};

export default function RadiusPage() {
  return (
    <div className="relative space-y-3">
      <PageBloom variant="cool" />
      {/* No page-level header. On a 375x812 mobile viewport the
          marketing prose ate ~190px and pushed the controls below
          the fold. The map + ribbon overlay IS the headline now. */}
      <RadiusBuilder amenities={OPEN_AMENITIES} />
    </div>
  );
}
