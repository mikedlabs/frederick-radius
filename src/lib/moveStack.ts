import { clientPlacesWithinRadius } from "@/lib/loaders/places-client";
import { FREDERICK_CENTER, WALKING_MPS } from "@/lib/geo";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * Move Stack — a ranked "here's a plan for your next few hours" itinerary
 * for downtown Frederick (the reviewers' "Move Stack"). Composes the data
 * we already have client-safe: the editorial feature_score, proximity to
 * downtown, category, and the weather/time-of-day. NOT a real-time
 * open-now engine — the slim client place set drops per-place hours (they
 * live in the 12MB server enrichment), so this is framed as a suggested
 * plan, not a guarantee that each stop is open this minute.
 *
 * v2 (when the business-info agent has filled hours): gate each step on
 * open-now and re-rank. The shape here already anticipates that.
 */

export type MoveStep = {
  n: number;
  verb: string;
  /** Linkable place when the step resolved to a real spot. */
  slug?: string;
  name: string;
  category?: string;
  /** Minutes on foot from downtown center (rounded). */
  walkMin?: number;
};

export type MoveStack = { title: string; intro: string; steps: MoveStep[] };

type Band = "morning" | "midday" | "afternoon" | "evening" | "late";

function bandFor(hour: number): Band {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late";
}

const DOWNTOWN_RADIUS_M = 1600; // ~20-min walk envelope

function walkMin(distanceM?: number): number | undefined {
  if (distanceM == null) return undefined;
  return Math.max(1, Math.round(distanceM / WALKING_MPS / 60));
}

/** A single template step: a verb + the categories that satisfy it. */
type Tpl = { verb: string; cats: string[] };

/** Best downtown place for a step by editorial score then proximity,
 *  skipping anything already used in the stack. */
function pick(
  pool: PlaceCardData[],
  cats: string[],
  used: Set<string>,
): PlaceCardData | null {
  const matches = pool
    .filter((p) => cats.includes(p.category) && !used.has(p.slug))
    .sort(
      (a, b) =>
        (b.feature_score ?? 0) - (a.feature_score ?? 0) ||
        (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity),
    );
  return matches[0] ?? null;
}

/** The Carroll Creek walk — a fixed editorial step (THE downtown stroll),
 *  swapped for an indoor stop when the weather's wet. */
const CREEK_SLUG = "carroll-creek-linear-park-frederick";

export function buildMoveStack(
  now: Date,
  opts: { wet: boolean } = { wet: false },
): MoveStack | null {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
  ) % 24;
  const band = bandFor(hour);

  const pool = clientPlacesWithinRadius(FREDERICK_CENTER, DOWNTOWN_RADIUS_M);

  // The outdoor stroll step, or an indoor culture stop when it's wet.
  const wetSwap: Tpl = { verb: "Duck into", cats: ["museum", "gallery", "book-store"] };
  const strollStep: { tpl?: Tpl; fixed?: MoveStep } = opts.wet
    ? { tpl: wetSwap }
    : {
        fixed: {
          n: 0,
          verb: "Walk",
          slug: pool.some((p) => p.slug === CREEK_SLUG) ? CREEK_SLUG : undefined,
          name: "Carroll Creek",
          category: "park",
        },
      };

  let plan: { title: string; intro: string; seq: Array<Tpl | { fixed: MoveStep }> };
  switch (band) {
    case "morning":
      plan = {
        title: "A good morning out",
        intro: "Coffee, a creek walk, something warm.",
        seq: [
          { verb: "Coffee", cats: ["coffee"] },
          strollStep.fixed ? { fixed: strollStep.fixed } : strollStep.tpl!,
          { verb: "Bite", cats: ["bakery"] },
        ],
      };
      break;
    case "midday":
    case "afternoon":
      plan = {
        title: "An afternoon plan",
        intro: "Lunch, a wander, a coffee to close.",
        seq: [
          { verb: "Lunch", cats: ["restaurant", "pizza"] },
          strollStep.fixed ? { fixed: strollStep.fixed } : strollStep.tpl!,
          { verb: "Coffee", cats: ["coffee"] },
        ],
      };
      break;
    case "evening":
      plan = {
        title: "Make an evening of it",
        intro: "Dinner downtown, a drink, then music.",
        seq: [
          { verb: "Dinner", cats: ["restaurant", "pizza"] },
          { verb: "Drinks", cats: ["bar", "brewery"] },
          { verb: "Music", cats: ["music", "theater"] },
        ],
      };
      break;
    default: // late
      plan = {
        title: "Still out?",
        intro: "A late drink within reach.",
        seq: [{ verb: "Drinks", cats: ["bar", "brewery"] }],
      };
  }

  const used = new Set<string>();
  const steps: MoveStep[] = [];
  for (const item of plan.seq) {
    if ("fixed" in item) {
      if (item.fixed.slug) used.add(item.fixed.slug);
      steps.push({ ...item.fixed, n: steps.length + 1 });
      continue;
    }
    const place = pick(pool, item.cats, used);
    if (!place) continue;
    used.add(place.slug);
    steps.push({
      n: steps.length + 1,
      verb: item.verb,
      slug: place.slug,
      name: place.name,
      category: place.category,
      walkMin: walkMin(place.distance_m),
    });
  }

  // Renumber after any skipped steps; need at least 2 to read as a plan.
  steps.forEach((s, i) => (s.n = i + 1));
  if (steps.length < 2) return null;
  return { title: plan.title, intro: plan.intro, steps };
}
