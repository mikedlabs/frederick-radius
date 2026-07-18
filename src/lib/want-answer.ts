import "server-only";
import { CRAVINGS, isPizzaPlace, matchesCraving, matchesCravingFacet } from "@/data/cravings";
import { CATEGORIES, CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import { MEALS, isMealKey, matchMeal } from "@/lib/meal";
import type { PlaceCardData } from "@/lib/loaders/places";
import { knownFor } from "@/lib/cuisine";
import { formatHoursLine, getOpenStatus, type OpenStatus } from "@/lib/hours";
import { formatDistance, haversineMeters } from "@/lib/geo";
import { mayAssertOpenState } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import { isChainName, ratingSignal } from "@/lib/category-ranking";

/**
 * The want answer — "I want coffee" resolved to places, ranked for RIGHT
 * NOW, shaped for the inline panel on /today.
 *
 * Answer-first, not a directory: ONE hero (the best open-now pick), a
 * short "also open" list, and a folded "opens later" group. Reuses the
 * exact vocabulary /nearby speaks — craving keys from data/cravings plus
 * the meal keys — so every existing /nearby?c= deep link has an inline
 * twin and the two surfaces can never rank from different taxonomies.
 */

// The generated client snapshot is also the smallest canonical public-place
// snapshot on the server: already deduped, decorated, and stripped of the
// detail-only enrichment arrays. Importing the full places loader here made a
// 2 KB answer route carry roughly 9 MB of enrichment data into every cold
// function. `npm run build:client-places` keeps this snapshot in sync.
type WantPlaceSnapshot = PlaceCardData & {
  want_match_category: string;
  want_match_subcategories?: string[];
};

const WANT_PLACES = CLIENT_RAW as unknown as WantPlaceSnapshot[];

export type WantRow = {
  slug: string;
  name: string;
  /** The one mono fact: "Open until 9pm" / "Closing soon · 10pm" / "Opens 7am". */
  fact: string;
  /** "6 min walk" under ~20 minutes on foot, else "3.4 mi"; null without a fix. */
  distance: string | null;
  photo: string | null;
  /** Town/municipality it sits in ("Brunswick", "Middletown"), so a glance
   *  answers "which one, and where" without opening the sheet. */
  where: string | null;
  /** One short signature line: the curated known-for, else a clamped blurb
   *  ("Wood-fired pies", "Third-wave roaster"). The field-guide detail. */
  detail: string | null;
  /** The single best VERIFIED insider tip (the moat's voice), when present. */
  tip: string | null;
  /** A standing deal hook ("Happy hour", "$1 oysters"), when present. */
  deal: string | null;
};

export type WantAnswer = {
  key: string;
  label: string;
  rankingMode: "best-fit" | "open-now";
  hero: WantRow | null;
  also: WantRow[];
  /** Complete open-now set for category tools that need an honest filter.
   *  Included only for breweries so ordinary Today answers stay compact. */
  open?: WantRow[];
  later: WantRow[];
  /** How many more open-later places fold behind the "later" preview. */
  laterMore: number;
  /** The fallback list shown when nothing is open now (and nothing opens
   *  later today) but the category still has places, e.g. farmers markets or
   *  playgrounds that aren't hours-bound. Keeps the panel flowing down with
   *  real places instead of a bare "nothing's open" line. Empty otherwise. */
  notable: WantRow[];
  total: number;
  /** The deep-browse door — the same URL the sub-chip used to navigate to. */
  browseHref: string;
  /** Honest ranking/filter context shown in the panel. */
  contextLabel: string;
  contextSource: "town" | "device" | "home" | "ip" | "county" | "none";
  fallbackReason: "outside-county" | "location-unavailable" | null;
};

/** The slice of a decorated place the partition logic reads — kept minimal
 *  and exported so the ranking rules are unit-testable with plain objects.
 *  The presentation fields (municipality, known_for, tips…) are optional so
 *  the pure ranking tests stay tiny; buildWantAnswer feeds the generated slim
 *  public-place snapshot. */
export type WantCandidate = {
  slug: string;
  name: string;
  open_status: OpenStatus;
  distance_m?: number;
  feature_score: number;
  google_photo_url?: string;
  municipality?: string;
  city?: string;
  short_blurb?: string;
  known_for?: string[];
  field_note_tip?: string;
  deal_hook?: string;
  google_rating?: number;
  google_rating_count?: number;
  hidden_gem?: boolean;
  local_favorite?: boolean;
};

/** The slice of a place a `refine` predicate can read — the narrowing seam
 *  Ask Frederick uses for cuisine ("thai") and area ("downtown") filters.
 *  `category` is the corrected want_match_category, same as the matcher sees. */
export type WantRefinable = {
  name: string;
  category: string;
  municipality?: string;
  geom: { lng: number; lat: number };
  short_blurb?: string;
  primary_type?: string;
};

const WALK_METERS_PER_MIN = 75; // ~2.8 mph, the app's walking assumption
const WALKABLE_MAX_MIN = 20;

function distanceLabel(m: number | undefined): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  const walkMin = Math.max(1, Math.round(m / WALK_METERS_PER_MIN));
  if (walkMin <= WALKABLE_MAX_MIN) return `${walkMin} min walk`;
  return formatDistance(m);
}

function isOpenNow(s: OpenStatus): boolean {
  return s.state === "open" || s.state === "closing-soon";
}

function opensLaterToday(s: OpenStatus): boolean {
  return s.state === "closed" && Boolean(s.opensToday && s.opensAt);
}

/** The town a place sits in, for the row's "where". Use the normalized
 *  POSTAL city ("Frederick"), NOT the municipality's editorial name
 *  ("Downtown Frederick") — the editorial label overclaims for the many
 *  City-of-Frederick places that aren't downtown (see placeName.ts, which
 *  folds "downtown frederick" -> "Frederick" for exactly this reason). Fall
 *  back to the municipality name only when a place has no clean city. */
function townLabel(c: WantCandidate): string | null {
  if (c.municipality && c.municipality !== "frederick") {
    return MUNICIPALITY_BY_SLUG[c.municipality]?.name ?? c.city?.trim() ?? null;
  }
  const city = c.city?.trim();
  if (city) return city;
  return c.municipality ? MUNICIPALITY_BY_SLUG[c.municipality]?.name ?? null : null;
}

/** Clamp a signature to one tidy phrase: strip any stray em dash (voice
 *  rule), cut at a word boundary, add an ellipsis when trimmed. */
function clampPhrase(raw: string, max = 52): string {
  const s = raw.replace(/\s*—\s*/g, ", ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 20 ? cut.slice(0, sp) : cut).replace(/[,;:·\-\s]+$/, "")}…`;
}

/** The one short field-guide signature for a place: the curated known-for
 *  first, else a cleaned blurb sentence (knownFor), clamped. Null when we
 *  have nothing honest to say. */
function signatureOf(c: WantCandidate): string | null {
  const curated = c.known_for?.[0]?.trim();
  if (curated) return clampPhrase(curated);
  const kf = knownFor({ name: c.name, short_blurb: c.short_blurb });
  return kf ? clampPhrase(kf) : null;
}

function toRow(c: WantCandidate, laneLater: boolean): WantRow {
  const line = formatHoursLine(c.open_status);
  return {
    slug: c.slug,
    name: c.name,
    // Inside the "Opens later" group the "Closed · " prefix is redundant —
    // the group heading already says it.
    fact: laneLater ? line.replace(/^Closed · /, "") : line,
    distance: distanceLabel(c.distance_m),
    photo: c.google_photo_url ?? null,
    where: townLabel(c),
    detail: signatureOf(c),
    tip: c.field_note_tip?.trim() || null,
    deal: c.deal_hook?.trim() || null,
  };
}

/**
 * Rank + partition candidates. Open places lead, nearest first when a fix
 * exists (feature score breaks ties and carries the no-fix ordering);
 * closed-but-opens-today places sort by how soon the doors open. Pure, so
 * the ranking rules live under unit tests.
 */
export function partitionWant(candidates: WantCandidate[]): {
  open: WantCandidate[];
  later: WantCandidate[];
  /** Neither open now nor opening later today (closed another day, or no
   *  posted hours). The notable-fallback pool, ranked like the open lane. */
  other: WantCandidate[];
  total: number;
} {
  const open = candidates.filter((c) => isOpenNow(c.open_status));
  const later = candidates.filter((c) => opensLaterToday(c.open_status));
  const other = candidates.filter(
    (c) => !isOpenNow(c.open_status) && !opensLaterToday(c.open_status),
  );

  const byProximityThenScore = (a: WantCandidate, b: WantCandidate) => {
    const da = a.distance_m ?? Infinity;
    const db = b.distance_m ?? Infinity;
    if (da !== db) return da - db;
    return b.feature_score - a.feature_score;
  };
  open.sort(byProximityThenScore);
  other.sort(byProximityThenScore);
  later.sort((a, b) => {
    const oa = a.open_status.state === "closed" ? a.open_status.opensAt ?? "99" : "99";
    const ob = b.open_status.state === "closed" ? b.open_status.opensAt ?? "99" : "99";
    return oa.localeCompare(ob);
  });

  return { open, later, other, total: candidates.length };
}

const ALSO_MAX = 4;
const LATER_PREVIEW = 3;
const NOTABLE_MAX = 6;

/**
 * Resolve a want key (craving or meal) to matcher + label + browse URL.
 * Null for unknown keys, so the API can 400 instead of guessing.
 */
function resolveWant(
  cKey: string,
  facetKey: string | null,
): {
  label: string;
  browseHref: string;
  match: (p: {
    category: string;
    name: string;
    subcategories?: string[];
    primary_type?: string;
  }) => boolean;
} | null {
  // Category chips (/category/<slug>) answer inline too, not just the
  // /nearby?c= cravings — so tapping "Bakeries" or "Pharmacies" flows the
  // same list down in place. The key is prefixed "cat:" so it can't collide
  // with a craving key. Matching mirrors the /category page exactly: the slug
  // plus its child categories, by category or subcategory.
  if (cKey.startsWith("cat:")) {
    const slug = cKey.slice(4);
    const cat = CATEGORY_BY_SLUG[slug];
    if (!cat) return null;
    const children = CATEGORIES.filter((x) => x.parent === slug).map((x) => x.slug);
    const match = new Set<string>([slug, ...children]);
    // Pizza mirrors rankPlaces' widened evidence (isPizzaPlace): most local
    // pizzerias carry a "restaurant" category from Google, so category
    // matching alone answered "pizza" with a fraction of the real list.
    const wantsPizza = match.has("pizza");
    return {
      label: cat.name,
      browseHref: `/category/${slug}`,
      match: (p) =>
        match.has(p.category) ||
        (p.subcategories ?? []).some((s) => match.has(s)) ||
        (wantsPizza && isPizzaPlace(p)),
    };
  }
  if (isMealKey(cKey)) {
    const meal = MEALS[cKey];
    return {
      label: meal.label,
      browseHref: `/nearby?c=${cKey}`,
      match: (p) => matchMeal(meal, p),
    };
  }
  const craving = CRAVINGS.find((c) => c.key === cKey);
  if (!craving) return null;
  const facet = facetKey ? craving.facets?.find((f) => f.key === facetKey) : null;
  return {
    label: facet?.label ?? craving.label,
    browseHref: `/nearby?c=${cKey}${facet ? `&facet=${facet.key}` : ""}`,
    // A facet narrows the already-matched set, same as /nearby.
    match: (p) =>
      matchesCraving(craving, p) && (!facet || matchesCravingFacet(facet, p)),
  };
}

function browseHrefForScope(href: string, municipality: string | null | undefined): string {
  if (!municipality || !href.startsWith("/nearby?")) return href;
  return `${href}&town=${encodeURIComponent(municipality)}`;
}

/**
 * Pick the hero from an APPROXIMATE (IP-seeded) origin. A coarse centroid
 * is honest enough to ORDER a list, but it must never CROWN one place "the
 * answer": Frederick's IP geolocation habitually lands on the south-side
 * corridor, which was promoting whatever chain sat nearest the centroid
 * (a Reddit reviewer caught Chick-fil-A leading a downtown list, July
 * 2026). Among the plausibly-near open places, the hero is the strongest
 * PLACE (feature score = curation + quality), not the fluke nearest.
 */
export function approxHeroIndex(open: WantCandidate[]): number {
  if (open.length <= 1) return 0;
  const pool = Math.min(open.length, 10);
  let best = 0;
  for (let i = 1; i < pool; i++) {
    if (open[i].feature_score > open[best].feature_score) best = i;
  }
  return best;
}

function bestFitScore(candidate: WantCandidate): number {
  return (
    candidate.feature_score +
    (candidate.local_favorite ? 1.5 : 0) +
    (candidate.hidden_gem ? 0.5 : 0) +
    ratingSignal(candidate.google_rating, candidate.google_rating_count) * 0.75 -
    (isChainName(candidate.name) ? 0.75 : 0)
  );
}

/** Rank a timeless Ask decision by editorial fit. Current hours remain on the
 * row, but they do not let an open chain beat the better local answer merely
 * because the question was asked after breakfast service ended. */
export function rankBestFit(candidates: WantCandidate[]): WantCandidate[] {
  return [...candidates].sort((a, b) => {
    const scoreDelta = bestFitScore(b) - bestFitScore(a);
    if (scoreDelta !== 0) return scoreDelta;
    const distanceDelta = (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
    if (distanceDelta !== 0) return distanceDelta;
    return a.name.localeCompare(b.name);
  });
}

export function buildWantAnswer(
  cKey: string,
  facetKey: string | null,
  origin: { lng: number; lat: number } | null,
  now: Date = new Date(),
  opts?: {
    approximateOrigin?: boolean;
    municipality?: string | null;
    contextLabel?: string;
    contextSource?: WantAnswer["contextSource"];
    fallbackReason?: WantAnswer["fallbackReason"];
    rankingMode?: WantAnswer["rankingMode"];
    /** Extra narrowing over the matched set (cuisine, area) — Ask Frederick's
     *  seam. Runs after the want matcher, so it only ever subtracts. */
    refine?: (p: WantRefinable) => boolean;
  },
): WantAnswer | null {
  const want = resolveWant(cKey, facetKey);
  if (!want) return null;

  const candidates: WantCandidate[] = WANT_PLACES
    .filter((p) => !opts?.municipality || p.municipality === opts.municipality)
    .filter((p) =>
      want.match({
        // The decorated category is the canonical corrected category. Include
        // every secondary tag and primary type so Today and Nearby execute the
        // same matcher instead of Today falling back to a raw legacy bucket.
        category: p.category,
        name: p.name,
        subcategories: p.subcategories,
        primary_type: p.primary_type,
      }),
    )
    .filter(
      (p) =>
        !opts?.refine ||
        opts.refine({
          name: p.name,
          category: p.want_match_category,
          municipality: p.municipality,
          geom: p.geom,
          short_blurb: p.short_blurb,
          primary_type: (p as { primary_type?: string }).primary_type,
        }),
    )
    .map((p) => {
      const mayAssertHours = mayAssertOpenState(
        p.hours_verified,
        p.hours_updated_at,
        now,
      ) && mayPublishVisitabilityHours(p.slug, p.hours, now);
      return {
        ...p,
        hours: mayAssertHours ? p.hours : undefined,
        hours_verified: mayAssertHours,
        open_status: getOpenStatus(
          mayAssertHours ? p.hours : undefined,
          { verified: mayAssertHours },
          now,
        ),
        distance_m: origin ? haversineMeters(origin, p.geom) : undefined,
      };
    });

  const { open, later, other, total } = partitionWant(candidates);
  const rankingMode = opts?.rankingMode ?? "open-now";

  if (rankingMode === "best-fit") {
    const best = rankBestFit(candidates);
    return {
      key: cKey,
      label: want.label,
      rankingMode,
      hero: best[0] ? toRow(best[0], false) : null,
      also: best.slice(1, ALSO_MAX + 1).map((candidate) => toRow(candidate, false)),
      later: [],
      laterMore: 0,
      notable: [],
      total,
      browseHref: browseHrefForScope(want.browseHref, opts?.municipality),
      contextLabel: opts?.contextLabel ?? "Whole county",
      contextSource: opts?.contextSource ?? "county",
      fallbackReason: opts?.fallbackReason ?? null,
    };
  }

  // When nothing is open now AND nothing opens later today, but the category
  // still has places (markets, playgrounds, or anything without posted
  // hours), fall back to the notable set so the panel still flows down with
  // real places instead of a dead "nothing's open" line.
  const notable = open.length === 0 && later.length === 0
    ? other.slice(0, NOTABLE_MAX).map((c) => toRow(c, false))
    : [];

  const heroIdx = opts?.approximateOrigin ? approxHeroIndex(open) : 0;
  const alsoPool = open.filter((_, i) => i !== heroIdx);

  return {
    key: cKey,
    label: want.label,
    rankingMode,
    hero: open[heroIdx] ? toRow(open[heroIdx], false) : null,
    also: alsoPool.slice(0, ALSO_MAX).map((c) => toRow(c, false)),
    open: cKey === "breweries" ? open.map((candidate) => toRow(candidate, false)) : undefined,
    later: later.slice(0, LATER_PREVIEW).map((c) => toRow(c, true)),
    laterMore: Math.max(0, later.length - LATER_PREVIEW),
    notable,
    total,
    browseHref: browseHrefForScope(want.browseHref, opts?.municipality),
    contextLabel: opts?.contextLabel ?? "Whole county",
    contextSource: opts?.contextSource ?? "county",
    fallbackReason: opts?.fallbackReason ?? null,
  };
}
