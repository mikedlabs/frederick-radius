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

/** Only a valid derived cache can preserve an earlier computation clock.
 * Invalid cached output is rebuilt from the authoritative client catalog. */
export function parseCopyScorecard(source: string): CopyScorecard | undefined {
  let value: unknown;
  try { value = JSON.parse(source); } catch { return undefined; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const previous = value as Partial<CopyScorecard>;
  if (typeof previous.computed_at !== "string" || !Number.isFinite(Date.parse(previous.computed_at)) ||
      !previous.counts || typeof previous.counts !== "object" || Array.isArray(previous.counts) ||
      !previous.bySlug || typeof previous.bySlug !== "object" || Array.isArray(previous.bySlug)) return undefined;
  const qualities: CopyQuality[] = ["none", "scraped", "auto_clean", "reviewed"];
  const { counts, bySlug } = previous;
  if (Object.keys(counts).length !== qualities.length ||
      qualities.some(key => !Number.isSafeInteger(counts[key]) || counts[key] < 0) ||
      Object.values(bySlug).some(quality => !qualities.includes(quality)) ||
      Object.values(counts).reduce((total, count) => total + count, 0) !== Object.keys(bySlug).length) return undefined;
  return previous as CopyScorecard;
}

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
