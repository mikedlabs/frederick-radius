import { isHoursFresh } from "@/lib/hours-freshness";

export const COVERAGE_TARGETS = {
  hours: 60,
  photo: 25,
  copy: 50,
  action: 85,
} as const;

export type CoverageDimension = keyof typeof COVERAGE_TARGETS;

export type CoveragePlace = {
  slug: string;
  name: string;
  municipality?: string;
  hours?: Record<string, unknown>;
  hours_verified?: boolean;
  hours_updated_at?: string;
  hero_image?: string;
  google_photo_url?: string;
  short_blurb?: string;
  phone?: string;
  website?: string;
  opentable_id?: string;
  resy_slug?: string;
  order_url?: string;
  menu_url?: string;
  commerce_links?: Array<{ type?: string; url?: string }>;
};

export type CoverageCounts = {
  total: number;
  hours: number;
  photo: number;
  copy: number;
  action: number;
};

export type CoverageSummary = CoverageCounts & {
  percentages: Record<CoverageDimension, number>;
};

export type TownCoverage = CoverageSummary & {
  slug: string;
  name: string;
  weakest: CoverageDimension;
  belowTarget: boolean;
};

export type CoveragePriority = {
  dimension: CoverageDimension;
  current: number;
  total: number;
  pct: number;
  target: number;
  needed: number;
};

export type DecisionCopyIssue =
  | "missing"
  | "too_short"
  | "too_long"
  | "incomplete_sentence"
  | "name_only"
  | "category_template"
  | "contact_cta"
  | "address_dump"
  | "short_name_echo"
  | "shared_boilerplate";

const ACTION_TYPES = new Set(["menu", "order", "reservation"]);
const STREET_ADDRESS_PREFIX =
  /^\d{1,6}\s+(?:(?:N|S|E|W|North|South|East|West)\.?\s+)?(?:[A-Za-z0-9.'’-]+\s+){0,6}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Parkway|Pkwy|Highway|Hwy)\b\.?/i;
const CITY_STATE_ZIP_PREFIX =
  /^[A-Za-z .'-]+,?\s+MD,?\s+21\d{3}\b/i;

function hasText(value?: string): boolean {
  return Boolean(value?.trim());
}

export function hasUsefulPhoto(place: CoveragePlace): boolean {
  return hasText(place.hero_image) || hasText(place.google_photo_url);
}

/** Count only a schedule that the public app may use for an open-now claim. */
export function hasPublishedFreshHours(
  place: CoveragePlace,
  now = new Date(),
): boolean {
  return Boolean(
    place.hours_verified &&
      place.hours &&
      Object.keys(place.hours).length > 0 &&
      isHoursFresh(place.hours_updated_at, now),
  );
}

/**
 * Count only stored, direct actions. Search-prefilled provider links are a
 * useful runtime fallback, but they must not make the source data look more
 * complete than it is.
 */
export function hasActionableContact(place: CoveragePlace): boolean {
  if (
    hasText(place.website) ||
    hasText(place.phone) ||
    hasText(place.menu_url) ||
    hasText(place.order_url) ||
    hasText(place.opentable_id) ||
    hasText(place.resy_slug)
  ) {
    return true;
  }

  return (place.commerce_links ?? []).some(
    (link) => ACTION_TYPES.has(link.type ?? "") && hasText(link.url),
  );
}

export function decisionCopyCounts(
  places: readonly CoveragePlace[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const place of places) {
    const blurb = (place.short_blurb ?? "").trim();
    if (blurb) counts.set(blurb, (counts.get(blurb) ?? 0) + 1);
  }
  return counts;
}

/**
 * This mirrors the release gate for decision-useful place copy: it must be a
 * complete, specific sentence rather than an address dump, contact prompt, or
 * repeated directory template.
 */
export function decisionCopyIssue(
  place: CoveragePlace,
  counts: ReadonlyMap<string, number>,
): DecisionCopyIssue | null {
  const blurb = (place.short_blurb ?? "").trim();
  if (!blurb) return "missing";
  if (blurb.length < 35) return "too_short";
  if (blurb.length > 220) return "too_long";
  if (!/[.!?]$/.test(blurb)) return "incomplete_sentence";

  const name = place.name.trim();
  if (blurb === name) return "name_only";
  if (/^(?:bars?|baker(?:y|ies)|coffee|parks?|restaurants?|shopping|worship)\s+in\s+/i.test(blurb)) {
    return "category_template";
  }
  if (/\b(?:more info about|click here|learn more|call us|visit us|contact us)\b/i.test(blurb)) {
    return "contact_cta";
  }
  if (
    STREET_ADDRESS_PREFIX.test(blurb)
    || CITY_STATE_ZIP_PREFIX.test(blurb)
  ) {
    return "address_dump";
  }
  if (blurb.startsWith(`${name} `)) {
    const remainderWords = blurb
      .slice(name.length)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (remainderWords.length < 5) return "short_name_echo";
  }
  if ((counts.get(blurb) ?? 0) > 3) return "shared_boilerplate";
  return null;
}

export function hasUsefulDecisionCopy(
  place: CoveragePlace,
  counts: ReadonlyMap<string, number>,
): boolean {
  return decisionCopyIssue(place, counts) === null;
}

function percentage(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((1000 * count) / total) / 10;
}

function summarizeWithCopyCounts(
  places: readonly CoveragePlace[],
  counts: ReadonlyMap<string, number>,
): CoverageSummary {
  const summary: CoverageCounts = {
    total: places.length,
    hours: 0,
    photo: 0,
    copy: 0,
    action: 0,
  };

  for (const place of places) {
    if (hasPublishedFreshHours(place)) summary.hours += 1;
    if (hasUsefulPhoto(place)) summary.photo += 1;
    if (hasUsefulDecisionCopy(place, counts)) summary.copy += 1;
    if (hasActionableContact(place)) summary.action += 1;
  }

  return {
    ...summary,
    percentages: {
      hours: percentage(summary.hours, summary.total),
      photo: percentage(summary.photo, summary.total),
      copy: percentage(summary.copy, summary.total),
      action: percentage(summary.action, summary.total),
    },
  };
}

export function summarizeCoverage(
  places: readonly CoveragePlace[],
): CoverageSummary {
  return summarizeWithCopyCounts(places, decisionCopyCounts(places));
}

function weakestDimension(
  percentages: Record<CoverageDimension, number>,
): CoverageDimension {
  return (Object.keys(COVERAGE_TARGETS) as CoverageDimension[]).sort(
    (a, b) =>
      percentages[a] / COVERAGE_TARGETS[a] -
      percentages[b] / COVERAGE_TARGETS[b],
  )[0];
}

export function summarizeCoverageByTown(
  places: readonly CoveragePlace[],
  towns: readonly { slug: string; name: string }[],
): TownCoverage[] {
  const copyCounts = decisionCopyCounts(places);
  const byTown = new Map<string, CoveragePlace[]>();
  for (const town of towns) byTown.set(town.slug, []);
  for (const place of places) {
    const slug = place.municipality || "unknown";
    const current = byTown.get(slug) ?? [];
    current.push(place);
    byTown.set(slug, current);
  }

  const nameBySlug = new Map(towns.map((town) => [town.slug, town.name]));
  return [...byTown.entries()].map(([slug, townPlaces]) => {
    const summary = summarizeWithCopyCounts(townPlaces, copyCounts);
    const weakest = weakestDimension(summary.percentages);
    const belowTarget = (Object.keys(COVERAGE_TARGETS) as CoverageDimension[]).some(
      (dimension) =>
        summary.percentages[dimension] < COVERAGE_TARGETS[dimension],
    );
    return {
      slug,
      name: nameBySlug.get(slug) ?? slug,
      ...summary,
      weakest,
      belowTarget,
    };
  });
}

export function coveragePriorities(
  summary: CoverageSummary,
): CoveragePriority[] {
  return (Object.keys(COVERAGE_TARGETS) as CoverageDimension[])
    .map((dimension) => {
      const target = COVERAGE_TARGETS[dimension];
      const current = summary[dimension];
      const targetCount = Math.ceil((target / 100) * summary.total);
      return {
        dimension,
        current,
        total: summary.total,
        pct: summary.percentages[dimension],
        target,
        needed: Math.max(0, targetCount - current),
      };
    })
    .filter((priority) => priority.needed > 0)
    .sort(
      (a, b) =>
        a.pct / a.target - b.pct / b.target ||
        b.needed - a.needed,
    );
}
