import { TAG_BY_SLUG } from "@/data/tags";

/**
 * PlaceAudienceTags — surfaces the AUDIENCE facet (Toddler/Kid/Teen Friendly,
 * Wheelchair Accessible, Good for Groups/Alone) plus a few high-signal feature
 * tags (Rainy Day, Seasonal, Weather Dependent) as a labeled "Good to know"
 * chip row. These tags exist in the dataset but were shadow data — never shown
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
  const shown = GOOD_TO_KNOW.filter((slug) => have.has(slug));
  if (shown.length === 0) return null;

  return (
    <section
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <h2 className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
        Good to know
      </h2>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {shown.map((slug) => (
          <li
            key={slug}
            className="inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] font-medium"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}
          >
            {TAG_BY_SLUG[slug]?.name ?? slug}
          </li>
        ))}
      </ul>
    </section>
  );
}
