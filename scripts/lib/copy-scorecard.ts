import { classifyDescription, type CopyQuality } from "../../src/lib/copy-quality";

type CopyPlace = {
  slug: string;
  name: string;
  short_blurb?: string;
  description_reviewed?: boolean;
};
export type CopyScorecard = {
  computed_at: string;
  counts: Record<CopyQuality, number>;
  bySlug: Record<string, CopyQuality>;
};

/** A computation clock is not a source observation. Preserve it when the
 * exact classified membership is unchanged, avoiding daily artifact churn. */
export function buildCopyScorecard(
  places: CopyPlace[],
  previous?: CopyScorecard,
  now = new Date(),
): CopyScorecard {
  const counts: Record<CopyQuality, number> = {
    none: 0, scraped: 0, auto_clean: 0, reviewed: 0,
  };
  const bySlug: Record<string, CopyQuality> = {};
  for (const place of places) {
    if (Object.hasOwn(bySlug, place.slug)) throw new Error("Duplicate copy-scorecard identity.");
    const quality = classifyDescription(place.name, place.short_blurb ?? "", Boolean(place.description_reviewed));
    counts[quality]++;
    bySlug[place.slug] = quality;
  }
  if (
    previous && Number.isFinite(Date.parse(previous.computed_at)) &&
    Object.keys(previous.counts).length === Object.keys(counts).length &&
    Object.entries(counts).every(([key, value]) => previous.counts[key as CopyQuality] === value) &&
    Object.keys(previous.bySlug).length === places.length &&
    Object.entries(bySlug).every(([slug, quality]) => Object.hasOwn(previous.bySlug, slug) && previous.bySlug[slug] === quality)
  ) return previous;
  return { computed_at: now.toISOString(), counts, bySlug };
}
