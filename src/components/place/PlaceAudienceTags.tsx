import { tagName } from "@/data/tags";
import PlaceSectionLabel, { PlaceDotList } from "./PlaceSectionLabel";

/**
 * PlaceAudienceTags — surfaces the AUDIENCE facet (Toddler/Kid/Teen Friendly,
 * Wheelchair Accessible, Good for Groups/Alone) plus a few high-signal feature
 * tags (Rainy Day, Seasonal, Weather Dependent) as a labeled "Good to know"
 * line of ink text, never capsules, because they are facts and not
 * controls. These tags exist in the dataset but were shadow data, never shown
 * on the detail page, so a parent never learned a spot was kid-friendly and a
 * wheelchair user never learned it was accessible. The amenity facet already
 * renders via PlaceAmenityIcons; this is the complementary human-context row.
 * Self-hides when the place has none of these tags.
 */

// Curated, in display order. Audience first (who it's for), then the
// planning-relevant feature/mood tags the journeys asked for.
const GOOD_TO_KNOW: string[] = [
  "kids-0-5",
  "kids-6-12",
  "teens",
  "adults",
  "groups",
  "solo",
  "accessible",
  "rainy-day",
  "seasonal",
  "weather-dependent",
];

export default function PlaceAudienceTags({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  const have = new Set(tags);
  // A tag we cannot name is a tag we cannot show. Rendering the raw slug was
  // how "kids-0-5" reached a reader; rendering an empty item would only be a
  // quieter version of the same mistake.
  const shown = GOOD_TO_KNOW.filter((slug) => have.has(slug) && tagName(slug));
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="good-to-know-heading" className="space-y-1">
      <PlaceSectionLabel id="good-to-know-heading">Good to know</PlaceSectionLabel>
      <PlaceDotList items={shown.map((slug) => tagName(slug) as string)} />
    </section>
  );
}
