import "server-only";
import { CRAVINGS } from "@/data/cravings";
import { MEALS, isMealKey } from "@/lib/meal";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { formatHoursLine, type OpenStatus } from "@/lib/hours";
import { formatDistance } from "@/lib/geo";

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

export type WantRow = {
  slug: string;
  name: string;
  /** The one mono fact: "Open until 9pm" / "Closing soon · 10pm" / "Opens 7am". */
  fact: string;
  /** "6 min walk" under ~20 minutes on foot, else "3.4 mi"; null without a fix. */
  distance: string | null;
  photo: string | null;
};

export type WantAnswer = {
  key: string;
  label: string;
  hero: WantRow | null;
  also: WantRow[];
  later: WantRow[];
  /** How many more open-later places fold behind the "later" preview. */
  laterMore: number;
  total: number;
  /** The deep-browse door — the same URL the sub-chip used to navigate to. */
  browseHref: string;
};

/** The slice of a decorated place the partition logic reads — kept minimal
 *  and exported so the ranking rules are unit-testable with plain objects. */
export type WantCandidate = {
  slug: string;
  name: string;
  open_status: OpenStatus;
  distance_m?: number;
  feature_score: number;
  google_photo_url?: string;
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
  total: number;
} {
  const open = candidates.filter((c) => isOpenNow(c.open_status));
  const later = candidates.filter((c) => opensLaterToday(c.open_status));

  open.sort((a, b) => {
    const da = a.distance_m ?? Infinity;
    const db = b.distance_m ?? Infinity;
    if (da !== db) return da - db;
    return b.feature_score - a.feature_score;
  });
  later.sort((a, b) => {
    const oa = a.open_status.state === "closed" ? a.open_status.opensAt ?? "99" : "99";
    const ob = b.open_status.state === "closed" ? b.open_status.opensAt ?? "99" : "99";
    return oa.localeCompare(ob);
  });

  return { open, later, total: candidates.length };
}

const ALSO_MAX = 4;
const LATER_PREVIEW = 3;

/**
 * Resolve a want key (craving or meal) to matcher + label + browse URL.
 * Null for unknown keys, so the API can 400 instead of guessing.
 */
function resolveWant(
  cKey: string,
  facetKey: string | null,
): { label: string; browseHref: string; match: (p: { category: string; name: string; subcategories?: string[] }) => boolean } | null {
  if (isMealKey(cKey)) {
    const meal = MEALS[cKey];
    const cats = new Set<string>(meal.cats);
    return {
      label: meal.label,
      browseHref: `/nearby?c=${cKey}`,
      match: (p) => cats.has(p.category),
    };
  }
  const craving = CRAVINGS.find((c) => c.key === cKey);
  if (!craving) return null;
  const facet = facetKey ? craving.facets?.find((f) => f.key === facetKey) : null;
  return {
    label: facet?.label ?? craving.label,
    browseHref: `/nearby?c=${cKey}${facet ? `&facet=${facet.key}` : ""}`,
    // A facet narrows the already-matched set, same as /nearby.
    match: (p) => craving.match(p) && (!facet || facet.match(p)),
  };
}

export function buildWantAnswer(
  cKey: string,
  facetKey: string | null,
  origin: { lng: number; lat: number } | null,
  now: Date = new Date(),
): WantAnswer | null {
  const want = resolveWant(cKey, facetKey);
  if (!want) return null;

  const candidates = publicPlaces()
    .filter((p) => want.match(p))
    .map((p) => decoratePlace(p, origin ?? undefined, now));

  const { open, later, total } = partitionWant(candidates);

  return {
    key: cKey,
    label: want.label,
    hero: open[0] ? toRow(open[0], false) : null,
    also: open.slice(1, 1 + ALSO_MAX).map((c) => toRow(c, false)),
    later: later.slice(0, LATER_PREVIEW).map((c) => toRow(c, true)),
    laterMore: Math.max(0, later.length - LATER_PREVIEW),
    total,
    browseHref: want.browseHref,
  };
}
