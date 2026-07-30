import "server-only";
import {
  CRAVINGS,
  isPizzaPlace,
  isPlaygroundPlace,
  matchesCraving,
  matchesCravingFacet,
} from "@/data/cravings";
import { CATEGORIES, CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import { MEALS, isMealKey, matchMeal } from "@/lib/meal";
import type { PlaceCardData } from "@/lib/loaders/places";
import { knownFor } from "@/lib/cuisine";
import { formatHoursLine, getOpenStatus, type OpenStatus } from "@/lib/hours";
import { formatDistance, haversineMeters } from "@/lib/geo";
import { mayAssertOpenState } from "@/lib/hours-freshness";
import { mayAssertNoneOpen } from "@/lib/hours-availability";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import { isChainName, ratingSignal } from "@/lib/category-ranking";
import { isLikelyOpenNow } from "@/data/reliable-open-windows";
import { mayUseLikelyOpenFallback } from "@/lib/likely-open";

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
  /** An official provider action for intents that are decided somewhere other
   *  than the venue's front door, such as choosing a movie and showtime. */
  action?: {
    label: string;
    href: string;
  };
  /** Present when this row is being used as a current-availability answer. */
  confidence?: "confirmed" | "likely";
  /** Real routed travel context, added only when Radius has an explicit
   *  device location and Mapbox Matrix answers within the request budget.
   *  `distance` remains the compact display line so older clients degrade
   *  cleanly; this evidence lets Ask explain why a nearby result moved up. */
  travel?: {
    mode: "walking";
    minutes: number;
    distanceMeters: number | null;
  };
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
  /** Whether an empty open lane may be reported as "nothing is open." False
   *  when too few of these candidates can state an open or closed hour at
   *  all, which makes the empty result a fact about our hours coverage
   *  rather than about the county. */
  mayAssertNoneOpen: boolean;
  /** The deep-browse door — the same URL the sub-chip used to navigate to. */
  browseHref: string;
  /** Honest ranking/filter context shown in the panel. */
  contextLabel: string;
  contextSource: "town" | "device" | "home" | "ip" | "county" | "none";
  fallbackReason: "outside-county" | "location-unavailable" | null;
};

export type WantAvailability = "required" | "bonus" | "not-applicable";

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

/**
 * Name-stripping can expose a sentence fragment ("Brewer's Alley has…" →
 * "has…"), while a few inherited blurbs contain conversational filler.
 * A blank detail is more useful than presenting either as Radius-authored
 * copy.
 */
export function usefulFallbackSignature(raw: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^[a-z]/.test(value)) return null;
  if (/^(?:i|we|our|they|you)\b/i.test(value)) return null;
  if (/\bsometimes\b.*\bsometimes\b/i.test(value)) return null;
  return clampPhrase(value);
}

/** The one short field-guide signature for a place: the curated known-for
 *  first, else a cleaned blurb sentence (knownFor), clamped. Null when we
 *  have nothing honest to say. */
function signatureOf(c: WantCandidate): string | null {
  const curated = c.known_for?.[0]?.trim();
  if (curated) return clampPhrase(curated);
  const kf = knownFor({ name: c.name, short_blurb: c.short_blurb });
  return usefulFallbackSignature(kf);
}

/** A price without the thing it buys is noise ("$2.75", "50% OFF"). */
export function usefulDealHook(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const contextWords = (value.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).filter(
    (word) => !/^(?:off|save|from|each|only)$/i.test(word),
  );
  return contextWords.length > 0 ? clampPhrase(value, 36) : null;
}

function toRow(
  c: WantCandidate,
  laneLater: boolean,
  confidence?: WantRow["confidence"],
): WantRow {
  const line = formatHoursLine(c.open_status);
  return {
    slug: c.slug,
    name: c.name,
    // Inside the "Opens later" group the "Closed · " prefix is redundant —
    // the group heading already says it.
    fact:
      confidence === "likely"
        ? "Likely open · check hours"
        : laneLater
          ? line.replace(/^Closed · /, "")
          : line,
    distance: distanceLabel(c.distance_m),
    photo: c.google_photo_url ?? null,
    where: townLabel(c),
    detail: signatureOf(c),
    tip: c.field_note_tip?.trim() || null,
    deal: usefulDealHook(c.deal_hook),
    confidence,
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

const MOVIE_SHOWTIMES: Record<string, string> = {
  "warehouse-cinemas-frederick-frederick":
    "https://frederick.warehousecinemas.com/tickets-showtimes/",
  "regal-westview-frederick":
    "https://www.regmovies.com/theatres/regal-westview-1910",
};

/** Movie theaters are useful based on what is playing, not whether their
 *  lobby has a conventional storefront-hours record. Keep the choice native,
 *  then hand the volatile film/time inventory to each cinema's official site. */
function toMovieRow(candidate: WantCandidate): WantRow {
  const row = toRow(candidate, false);
  const href = MOVIE_SHOWTIMES[candidate.slug];
  return {
    ...row,
    fact: "Choose a film and showtime.",
    action: href
      ? {
          label: "Showtimes & tickets",
          href,
        }
      : undefined,
  };
}

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
  availability: WantAvailability;
  match: (p: {
    category: string;
    name: string;
    subcategories?: string[];
    primary_type?: string;
    short_blurb?: string;
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
    const wantsPlayground = match.has("playground");
    const availability: WantAvailability =
      ["park", "playground", "trail", "outdoors"].includes(slug)
        ? "not-applicable"
        : ["library", "worship", "market"].includes(slug)
          ? "bonus"
          : "required";
    return {
      label: cat.name,
      browseHref: `/category/${slug}`,
      availability,
      match: (p) =>
        match.has(p.category) ||
        (p.subcategories ?? []).some((s) => match.has(s)) ||
        (wantsPizza && isPizzaPlace(p)) ||
        (wantsPlayground && isPlaygroundPlace(p)),
    };
  }
  if (isMealKey(cKey)) {
    const meal = MEALS[cKey];
    return {
      label: meal.label,
      browseHref: `/nearby?c=${cKey}`,
      availability: "required",
      match: (p) => matchMeal(meal, p),
    };
  }
  const craving = CRAVINGS.find((c) => c.key === cKey);
  if (!craving) return null;
  const facet = facetKey ? craving.facets?.find((f) => f.key === facetKey) : null;
  return {
    label: facet?.label ?? craving.label,
    browseHref: `/nearby?c=${cKey}${facet ? `&facet=${facet.key}` : ""}`,
    availability: craving.availability ?? (craving.alwaysOpen ? "not-applicable" : "required"),
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

function bestFitScore(candidate: WantCandidate, preciseOrigin: boolean): number {
  const proximity = preciseOrigin && candidate.distance_m != null
    ? 10 / (1 + candidate.distance_m / 600)
    : 0;
  return (
    candidate.feature_score +
    (candidate.local_favorite ? 1.5 : 0) +
    (candidate.hidden_gem ? 0.5 : 0) +
    ratingSignal(candidate.google_rating, candidate.google_rating_count) * 0.75 -
    (isChainName(candidate.name) ? 0.75 : 0) +
    proximity
  );
}

/** Rank a timeless Ask decision by editorial fit. Current hours remain on the
 * row, but they do not let an open chain beat the better local answer merely
 * because the question was asked after breakfast service ended. */
export function rankBestFit(candidates: WantCandidate[], preciseOrigin = false): WantCandidate[] {
  return [...candidates].sort((a, b) => {
    const scoreDelta = bestFitScore(b, preciseOrigin) - bestFitScore(a, preciseOrigin);
    if (scoreDelta !== 0) return scoreDelta;
    const distanceDelta = (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
    if (distanceDelta !== 0) return distanceDelta;
    return a.name.localeCompare(b.name);
  });
}

function hasUnknownAvailability(candidate: WantCandidate): boolean {
  return (
    candidate.open_status.state === "unknown" ||
    candidate.open_status.state === "unverified"
  );
}

function rankFlexibleBestFit(
  candidates: WantCandidate[],
  availability: WantAvailability,
  preciseOrigin: boolean,
): WantCandidate[] {
  return [...candidates].sort((a, b) => {
    const availabilityBonus = (candidate: WantCandidate) =>
      availability !== "not-applicable" && isOpenNow(candidate.open_status)
        ? 0.75
        : 0;
    const scoreDelta =
      bestFitScore(b, preciseOrigin) +
      availabilityBonus(b) -
      bestFitScore(a, preciseOrigin) -
      availabilityBonus(a);
    if (scoreDelta !== 0) return scoreDelta;
    const distanceDelta =
      (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
    if (distanceDelta !== 0) return distanceDelta;
    return a.name.localeCompare(b.name);
  });
}

export type WantAvailabilityResolution = ReturnType<typeof partitionWant> & {
  /** Places eligible to lead the answer under the current coverage policy. */
  current: WantCandidate[];
  /** True only when verified-hours coverage can support an open-only answer. */
  hardAvailability: boolean;
  rankingMode: WantAnswer["rankingMode"];
  /** False for bonus/timeless intents even when their hours happen to be well-covered. */
  mayAssertNoneOpen: boolean;
};

/**
 * Resolve the availability policy before presentation.
 *
 * Current hours are a hard gate only when the intent actually requires them
 * and enough of the matched set has trustworthy hours to support that
 * judgment. With thin coverage, a confirmed-open place remains useful
 * evidence, but it cannot erase a much closer place whose hours are simply
 * unknown. Confirmed-closed places stay out of the lead pool either way.
 */
export function resolveWantAvailability(
  candidates: WantCandidate[],
  availability: WantAvailability,
  preciseOrigin = false,
): WantAvailabilityResolution {
  const partitioned = partitionWant(candidates);
  const coverageSupportsOpenOnly = mayAssertNoneOpen(
    candidates.map((candidate) => candidate.open_status),
  );
  const hardAvailability =
    availability === "required" && coverageSupportsOpenOnly;

  if (hardAvailability) {
    return {
      ...partitioned,
      current: partitioned.open,
      hardAvailability: true,
      rankingMode: "open-now",
      mayAssertNoneOpen: true,
    };
  }

  return {
    ...partitioned,
    // Thin coverage does not justify hiding unknown-hour places, but a place
    // we can prove is open must still lead a right-now answer. Rank each
    // confidence lane on its own, then place unknown hours after confirmed
    // open results instead of letting proximity promote uncertainty above
    // evidence.
    current:
      availability === "required"
        ? [
            ...rankFlexibleBestFit(
              candidates.filter((candidate) =>
                isOpenNow(candidate.open_status),
              ),
              availability,
              preciseOrigin,
            ),
            ...rankFlexibleBestFit(
              candidates.filter(hasUnknownAvailability),
              availability,
              preciseOrigin,
            ),
          ]
        : rankFlexibleBestFit(
            candidates.filter(
              (candidate) =>
                isOpenNow(candidate.open_status) ||
                hasUnknownAvailability(candidate),
            ),
            availability,
            preciseOrigin,
          ),
    hardAvailability: false,
    rankingMode: "best-fit",
    mayAssertNoneOpen: false,
  };
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
        // The generated want taxonomy is the human-reviewed discovery role.
        // Raw Google categories can describe a secondary service (a popcorn
        // market tagged restaurant, or a tea retailer tagged coffee) and were
        // leaking those businesses into Today despite corrected fields being
        // present in this snapshot.
        category: p.want_match_category,
        name: p.name,
        subcategories: p.want_match_subcategories,
        primary_type: p.primary_type,
        short_blurb: p.short_blurb,
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

  const preciseOrigin = Boolean(origin && !opts?.approximateOrigin);
  const availability = resolveWantAvailability(
    candidates,
    want.availability,
    preciseOrigin,
  );
  const { open, later, other, total } = availability;
  const requestedRankingMode = opts?.rankingMode;
  const rankingMode =
    requestedRankingMode ?? availability.rankingMode;
  const noneOpenIsSayable =
    requestedRankingMode === "best-fit"
      ? false
      : availability.mayAssertNoneOpen;

  // "Movies" is not an open-now storefront question. Cinema hours do not
  // answer which films are playing, and most theaters do not publish useful
  // lobby hours through Places. Present every local cinema as a decision with
  // a direct official showtimes action instead of an empty-state warning.
  if (cKey === "movies") {
    const ranked = rankBestFit(
      candidates,
      preciseOrigin,
    );
    return {
      key: cKey,
      label: want.label,
      rankingMode: "best-fit",
      hero: ranked[0] ? toMovieRow(ranked[0]) : null,
      also: ranked.slice(1, ALSO_MAX + 1).map(toMovieRow),
      later: [],
      laterMore: 0,
      notable: [],
      total,
      mayAssertNoneOpen: noneOpenIsSayable,
      browseHref: browseHrefForScope(want.browseHref, opts?.municipality),
      contextLabel: opts?.contextLabel ?? "Whole county",
      contextSource: opts?.contextSource ?? "county",
      fallbackReason: opts?.fallbackReason ?? null,
    };
  }

  if (rankingMode === "best-fit") {
    // An explicit best-fit request (Ask questions that are not about current
    // availability) remains timeless. The automatic best-fit fallback caused
    // by thin hours coverage is stricter: confirmed-closed places do not lead,
    // and an open badge is attached only to a place that is truly open now.
    const best =
      requestedRankingMode === "best-fit"
        ? rankBestFit(candidates, preciseOrigin)
        : availability.current;
    const rowForBestFit = (candidate: WantCandidate) =>
      toRow(
        candidate,
        false,
        isOpenNow(candidate.open_status) ? "confirmed" : undefined,
      );
    const breweryCurrent =
      cKey !== "breweries"
        ? undefined
        : open.length > 0
          ? open.map((candidate) => toRow(candidate, false, "confirmed"))
          : other
              .filter(
                (candidate) =>
                  mayUseLikelyOpenFallback(candidate.open_status) &&
                  isLikelyOpenNow(candidate.slug, now),
              )
              .map((candidate) => toRow(candidate, false, "likely"));
    return {
      key: cKey,
      label: want.label,
      rankingMode,
      hero: best[0] ? rowForBestFit(best[0]) : null,
      also: best.slice(1, ALSO_MAX + 1).map(rowForBestFit),
      open: breweryCurrent,
      later:
        requestedRankingMode === "best-fit"
          ? []
          : later.slice(0, LATER_PREVIEW).map((candidate) =>
              toRow(candidate, true),
            ),
      laterMore:
        requestedRankingMode === "best-fit"
          ? 0
          : Math.max(0, later.length - LATER_PREVIEW),
      notable:
        requestedRankingMode === "best-fit" ||
        best.length > 0 ||
        later.length > 0
          ? []
          : other
              .filter(
                (candidate) =>
                  !isOpenNow(candidate.open_status) &&
                  !hasUnknownAvailability(candidate),
              )
              .slice(0, NOTABLE_MAX)
              .map((candidate) => toRow(candidate, false)),
      total,
      mayAssertNoneOpen: noneOpenIsSayable,
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
  const likely =
    open.length === 0
      ? other.filter(
          (candidate) =>
            mayUseLikelyOpenFallback(candidate.open_status) &&
            isLikelyOpenNow(candidate.slug, now),
        )
      : [];
  const current = open.length > 0 ? open : likely;
  const currentConfidence: WantRow["confidence"] =
    open.length > 0 ? "confirmed" : "likely";

  const notable = current.length === 0 && later.length === 0
    ? other.slice(0, NOTABLE_MAX).map((c) => toRow(c, false))
    : [];

  const heroIdx = opts?.approximateOrigin ? approxHeroIndex(current) : 0;
  const alsoPool = current.filter((_, i) => i !== heroIdx);

  return {
    key: cKey,
    label: want.label,
    rankingMode,
    hero: current[heroIdx]
      ? toRow(current[heroIdx], false, currentConfidence)
      : null,
    also: alsoPool
      .slice(0, ALSO_MAX)
      .map((candidate) => toRow(candidate, false, currentConfidence)),
    open:
      cKey === "breweries"
        ? current.map((candidate) =>
            toRow(candidate, false, currentConfidence),
          )
        : undefined,
    later: later.slice(0, LATER_PREVIEW).map((c) => toRow(c, true)),
    laterMore: Math.max(0, later.length - LATER_PREVIEW),
    notable,
    total,
    mayAssertNoneOpen: noneOpenIsSayable,
    browseHref: browseHrefForScope(want.browseHref, opts?.municipality),
    contextLabel: opts?.contextLabel ?? "Whole county",
    contextSource: opts?.contextSource ?? "county",
    fallbackReason: opts?.fallbackReason ?? null,
  };
}
